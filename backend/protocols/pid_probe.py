"""Finite, explicit Mode 01 reads. Independent of the passive command whitelist."""

import re
import time
from datetime import datetime, timezone
from typing import Literal

from pydantic import Field

from backend.models import Schema

SUPPORT_PIDS = tuple(range(0, 0xE0, 0x20))
SAMPLES = {
    0x0C: ("Engine RPM (not traction motor RPM)", "rpm", 2),
    0x0D: ("Vehicle speed", "km/h", 1),
    0x42: ("Control module voltage (not traction battery)", "V", 2),
}
SETUP = (
    "ATE0",
    "ATL0",
    "ATS1",
    "ATH1",
    "ATD0",
    "ATCAF1",
    "ATAR",
    "STP 33",
    "STCAF 0",
    "ATSH 7DF",
    "ATCFC0",
    "STCSEGR 0",
    "STCSEGT 0",
    "STFAC",
    "STFA",
    "STPTO 1000",
    "STPTRQ 2000",
    "STCMM 0",
)
RESTORE = ("STCMM 0", "ATCAF0", "ATD1", "ATS0", "STP 31", "STPBR 500000", "STPTRQ 1")
REQUESTS = frozenset(f"01{pid:02X}" for pid in (*SUPPORT_PIDS, *SAMPLES))
WHITELIST = frozenset((*SETUP, *RESTORE)) | REQUESTS


class PIDSupport(Schema):
    ecu_id: str
    pids: list[str]


class PIDValue(Schema):
    ecu_id: str
    pid: str
    name: str
    value: float
    unit: str
    timestamp_utc: datetime


class PIDReport(Schema):
    timestamp_utc: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    outcome: Literal["responded", "no_response"] = "no_response"
    support: list[PIDSupport] = Field(default_factory=list)
    values: list[PIDValue] = Field(default_factory=list)
    requests_sent: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


def parse_responses(response: str, request: str) -> dict[str, bytes]:
    """ATH1/ATD0: accept only complete 11-bit ISO-TP single frames."""
    result = {}
    for line in response.replace(">", "").replace("\n", "\r").split("\r"):
        line = line.strip().upper()
        if not line or line.replace(" ", "") == request or line == "NO DATA":
            continue
        if not re.fullmatch(r"7E[8-F](?: [0-9A-F]{2}){2,8}", line):
            raise ValueError(f"Unexpected diagnostic response: {line[:80]}")
        ecu, *tokens = line.split()
        data = bytes.fromhex("".join(tokens))
        size = data[0]
        if not 1 <= size <= 7 or len(data) < size + 1:
            raise ValueError("Unsupported or truncated ISO-TP response; no flow control sent")
        payload = data[1 : size + 1]
        if payload[:2] != bytes((0x41, int(request[2:], 16))):
            raise ValueError(
                f"Negative or mismatched PID response from ECU {ecu}: {payload.hex().upper()}; probe stopped"
            )
        if ecu in result and result[ecu] != payload[2:]:
            raise ValueError("Conflicting responses from one ECU")
        result[ecu] = payload[2:]
    return result


class StandardPIDProbe:
    allowed_commands = WHITELIST

    def __init__(self, transport, sleep=time.sleep):
        self.transport = transport
        self.sleep = sleep
        self.synchronized = True
        self.last_request = None

    def exchange(self, command):
        if command not in self.allowed_commands:
            raise ValueError("Command rejected by fixed read-only PID whitelist")
        self.transport.event("tx", f"Explicit PID probe: {command}")
        self.synchronized = False
        self.transport.serial.write((command + "\r").encode("ascii"))
        deadline = time.monotonic() + 10
        buffer = bytearray()
        while time.monotonic() < deadline:
            chunk = self.transport.serial.read(1)
            self.transport.counters["received_bytes"] += len(chunk)
            buffer.extend(chunk)
            if len(buffer) > 8192:
                raise RuntimeError("PID response exceeds bound")
            if b">" in buffer:
                self.synchronized = True
                self.transport.prompt_ready = True
                response = buffer.decode("ascii", errors="strict")
                self.transport.event("info", f"PID probe response completed ({len(buffer)} bytes)")
                return response
        raise TimeoutError("PID prompt timeout; no further requests sent")

    def configure(self, command):
        response = self.exchange(command)
        lines = [s.strip() for s in response.replace(">", "").replace("\n", "\r").split("\r")]
        lines = [s for s in lines if s and s.replace(" ", "") != command.replace(" ", "")]
        if lines != ["OK"]:
            raise RuntimeError(f"PID configuration failed for {command}")

    def request(self, pid, report):
        if self.last_request is not None:
            self.sleep(max(0, 2 - (time.monotonic() - self.last_request)))
        command = f"01{pid:02X}"
        report.requests_sent.append(command)
        self.last_request = time.monotonic()
        return parse_responses(self.exchange(command), command)

    def run(self):
        t = self.transport
        if not t.connected or t.monitoring or (t.thread and t.thread.is_alive()):
            raise RuntimeError("Stop passive capture before explicit PID reads")
        if t.config.can_bitrate != 500000:
            raise ValueError("This initial probe supports only the explicitly selected 500 kbps channel")
        report = PIDReport()
        supported = {}
        try:
            for command in SETUP:
                self.configure(command)
            eligible = None
            for base in SUPPORT_PIDS:
                responses = self.request(base, report)
                next_eligible = set()
                for ecu, data in responses.items():
                    if eligible is not None and ecu not in eligible:
                        continue
                    if len(data) != 4:
                        raise ValueError("PID support bitmap must contain four bytes")
                    mask = int.from_bytes(data, "big")
                    ids = {base + n for n in range(1, 33) if mask & (1 << (32 - n))}
                    supported.setdefault(ecu, set()).update(ids)
                    if base + 32 in ids:
                        next_eligible.add(ecu)
                if not next_eligible:
                    break
                eligible = next_eligible
            report.support = [
                PIDSupport(ecu_id=ecu, pids=[f"01{p:02X}" for p in sorted(ids)])
                for ecu, ids in supported.items()
            ]
            report.outcome = "responded" if supported else "no_response"
            for pid, (name, unit, size) in SAMPLES.items():
                if not any(pid in ids for ids in supported.values()):
                    continue
                for ecu, data in self.request(pid, report).items():
                    if pid not in supported.get(ecu, set()):
                        continue
                    if len(data) != size:
                        raise ValueError("PID value length mismatch")
                    raw = int.from_bytes(data, "big")
                    value = raw / (4 if pid == 0x0C else 1000 if pid == 0x42 else 1)
                    report.values.append(
                        PIDValue(
                            ecu_id=ecu,
                            pid=f"01{pid:02X}",
                            name=name,
                            value=value,
                            unit=unit,
                            timestamp_utc=datetime.now(timezone.utc),
                        )
                    )
            report.notes.append("One-shot read; values are not live and are not saved. No OEM PID probing.")
            if not supported:
                report.notes.append(
                    "No standard PID response; this does not establish that the vehicle has no diagnostics."
                )
            return report
        finally:
            if self.synchronized:
                try:
                    for command in RESTORE:
                        self.configure(command)
                except Exception:
                    t.connected = False
                    t.serial.close()
                    raise
            else:
                t.connected = False
                t.serial.close()
