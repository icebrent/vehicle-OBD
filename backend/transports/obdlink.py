"""Receive-only MX+ driver. No vehicle request/send primitive is exposed."""

import threading
import time
from enum import StrEnum

import serial

from backend.protocols.obdlink import ParseError, parse_line
from backend.transports.base import Transport


class Command(StrEnum):
    IDENTIFY = "ATI"
    HARDWARE = "STDI"
    ECHO_OFF = "ATE0"
    LINEFEED_OFF = "ATL0"
    SPACES = "ATS0"
    HEADERS = "ATH1"
    RAW_FORMAT = "ATCAF0"
    DLC = "ATD1"
    RAW_HS_CAN = "STP 31"
    SILENT = "STCMM 0"
    FLOW_OFF = "ATCFC0"
    SEGMENT_OFF = "STCSEGR 0"
    HARDWARE_PATTERN = "ATCF 00000000"
    HARDWARE_MASK = "ATCM 00000000"
    CLEAR_FILTERS = "STFAC"
    PASS_ALL = "STFPA 0000,0000"
    READ_BITRATE = "STPBRR"
    MONITOR = "STM 16"


BITRATES = {rate: f"STPBR {rate}" for rate in (125000, 250000, 500000, 1000000)}
WHITELIST = frozenset(str(command) for command in Command) | frozenset(BITRATES.values())


class OBDLinkTransport(Transport):
    def __init__(self, config, session_id, serial_factory=serial.Serial, command_timeout=10):
        self.config = config
        self.session_id = session_id
        self.serial_factory = serial_factory
        self.timeout = command_timeout
        self.serial = None
        self.connected = False
        self.monitoring = False
        self.stream_failed = False
        self.prompt_ready = False
        self.thread = None
        self.halt = threading.Event()
        self.event = lambda level, message: None
        self.counters = dict(received_bytes=0, parsed_frames=0, parse_errors=0, buffer_overflows=0)

    def _log(self, level, message):
        self.event(level, message)

    def _write_command(self, command):
        if command not in WHITELIST:
            raise ValueError("Adapter command rejected by receive-only whitelist")
        self._log("tx", command)
        self.serial.write((command + "\r").encode("ascii"))
        # The adapter prompt confirms completion. Serial.flush() has no timeout;
        # avoid adding an unbounded wait after the timeout-controlled write.

    def _prompt(self, initial=b"", timeout=None):
        deadline = time.monotonic() + (self.timeout if timeout is None else timeout)
        buffer = bytearray(initial)
        while time.monotonic() < deadline:
            if b">" in buffer:
                text = buffer[: buffer.index(b">") + 1].decode("ascii", errors="strict")
                self.prompt_ready = True
                self._log("rx", text)
                return text
            chunk = self.serial.read(1)
            self.counters["received_bytes"] += len(chunk)
            buffer.extend(chunk)
            if len(buffer) > 65536:
                raise RuntimeError("Adapter command response too long")
        self.prompt_ready = False
        raise TimeoutError("Adapter prompt timeout; no further commands sent")

    def _command(self, command, identity=False):
        self._write_command(command)
        response = self._prompt()
        lines = [s.strip() for s in response.replace(">", "").replace("\n", "\r").split("\r")]
        lines = [s for s in lines if s and s.replace(" ", "") != command.replace(" ", "")]
        if any("?" in s or "ERROR" in s or "FULL" in s for s in lines):
            raise RuntimeError(f"Unsupported or failed adapter command {command}: {response}")
        if not identity and lines != ["OK"]:
            raise RuntimeError(f"Missing OK for {command}: {response}")
        if identity and not lines:
            raise RuntimeError(f"Missing identity response for {command}")
        return " ".join(lines)

    def connect(self):
        if self.connected or self.serial is not None:
            raise RuntimeError("Already connected")
        try:
            self.serial = self.serial_factory(
                port=self.config.port, baudrate=self.config.serial_baudrate, timeout=0.1, write_timeout=2
            )
            self._command(Command.IDENTIFY, identity=True)
            hardware = self._command(Command.HARDWARE, identity=True)
            if "OBDLink MX+" not in hardware:
                raise RuntimeError("Selected device did not identify as OBDLink MX+")
            self.connected = True
        except Exception:
            self.disconnect()
            raise

    def start(self, emit, event):
        if not self.connected or self.monitoring or (self.thread and self.thread.is_alive()):
            raise RuntimeError("Invalid monitor start state")
        self.event = event
        commands = [
            Command.ECHO_OFF,
            Command.LINEFEED_OFF,
            Command.SPACES,
            Command.HEADERS,
            Command.RAW_FORMAT,
            Command.DLC,
            Command.RAW_HS_CAN,
            BITRATES[self.config.can_bitrate],
            Command.SILENT,
            Command.FLOW_OFF,
            Command.SEGMENT_OFF,
            Command.HARDWARE_PATTERN,
            Command.HARDWARE_MASK,
            Command.CLEAR_FILTERS,
            Command.PASS_ALL,
        ]
        for command in commands:
            self._command(command)
        actual = self._command(Command.READ_BITRATE, identity=True)
        if actual != str(self.config.can_bitrate):
            raise RuntimeError(f"CAN bitrate mismatch: requested {self.config.can_bitrate}, actual {actual}")
        self.monitoring = True
        self.stream_failed = False
        self.prompt_ready = False
        self._write_command(Command.MONITOR)
        self.halt.clear()
        self.thread = threading.Thread(target=self._read, args=(emit,), daemon=True)
        self.thread.start()

    def _read(self, emit):
        buffer = bytearray()
        batch_frames = 0
        try:
            while not self.halt.is_set():
                available = getattr(self.serial, "in_waiting", 0)
                chunk = self.serial.read(min(max(available, 1), 4096))
                self.counters["received_bytes"] += len(chunk)
                for index, value in enumerate(chunk):
                    if value == 62:  # Command prompt, '>'.
                        self.monitoring = False
                        self.prompt_ready = True
                        if buffer.strip() or chunk[index + 1 :].strip():
                            raise RuntimeError("Unexpected text at monitor batch prompt")
                        if batch_frames != 16:
                            raise RuntimeError(f"Incomplete monitor batch: {batch_frames}/16 frames")
                        # Only normal completion permits another passive batch.
                        # This deliberate gap sacrifices coverage to drain output.
                        if self.halt.wait(self.config.monitor_interval_seconds):
                            return
                        batch_frames = 0
                        self.prompt_ready = False
                        self.monitoring = True
                        self._write_command(Command.MONITOR)
                        break
                    if value in (13, 10):
                        if not buffer:
                            continue
                        line = buffer.decode("ascii", errors="replace")
                        buffer.clear()
                        if line.strip() in {"STM 16", "STM16", "OK"}:
                            continue
                        if "BUFFER FULL" in line:
                            self.counters["buffer_overflows"] += 1
                            # BUFFER FULL automatically terminates STM. Consume
                            # its prompt, including bytes already in this chunk,
                            # without sending an interrupt into idle command mode.
                            self.monitoring = False
                            self.stream_failed = True
                            self.connected = False
                            self.event("error", line)
                            try:
                                self._prompt(chunk[index + 1 :], timeout=min(self.timeout, 2.0))
                            except (TimeoutError, OSError, UnicodeError) as exc:
                                self.event("warning", f"Monitor exit prompt not synchronized: {exc}")
                            finally:
                                self.serial.close()
                            return
                        if "OVERFLOW" in line:
                            self.counters["buffer_overflows"] += 1
                            raise RuntimeError(line)
                        if any(word in line for word in ("ERROR", "STOPPED", "CAN ERROR", "?", "UNABLE")):
                            raise RuntimeError(line)
                        try:
                            frame = parse_line(line, self.session_id, self.config.channel)
                            batch_frames += 1
                            self.counters["parsed_frames"] += 1
                            emit(frame)
                        except ParseError as exc:
                            self.counters["parse_errors"] += 1
                            # Keep malformed traffic from flooding diagnostics.
                            if (
                                self.counters["parse_errors"] <= 10
                                or self.counters["parse_errors"] % 100 == 0
                            ):
                                self.event("warning", f"Parse error: {exc}; raw={line[:256]}")
                    else:
                        buffer.append(value)
                        if len(buffer) > 4096:
                            self.counters["parse_errors"] += 1
                            raise RuntimeError("Serial line exceeded 4096 bytes")
        except Exception as exc:
            self.stream_failed = True
            self.connected = False
            self.event("error", str(exc))

    def stop(self):
        self.halt.set()
        if self.thread:
            self.thread.join(timeout=3)
            if self.thread.is_alive():
                raise TimeoutError("Serial reader did not stop")
            self.thread = None
        if self.serial and self.monitoring:
            # Single space interrupts STM. A bare CR in idle mode could repeat a previous request.
            self._log("tx", "<SPACE: interrupt STM>")
            self.serial.write(b" ")
            try:
                response = self._prompt()
                if "STOPPED" not in response and not self.stream_failed:
                    raise RuntimeError("Missing STOPPED acknowledgement; disconnect device")
            except Exception:
                self.connected = False
                raise
            finally:
                self.monitoring = False

    def disconnect(self):
        try:
            self.stop()
        finally:
            if self.serial:
                self.serial.close()
                self.serial = None
            self.connected = False
