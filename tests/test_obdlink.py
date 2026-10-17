import collections
import time

import pytest
from conftest import wait_until

from backend.models import ConnectionConfig
from backend.transports.obdlink import WHITELIST, OBDLinkTransport


class FakeSerial:
    def __init__(self, *args, fail=None, traffic="123 2 00 FF\r", **kwargs):
        self.buffer = collections.deque()
        self.writes = []
        self.closed = False
        self.fail = fail
        self.traffic = traffic

    def write(self, data):
        self.writes.append(data)
        command = data.decode("ascii").strip()
        response = {
            "ATI": "ELM327 v1.4b\r>",
            "STDI": "OBDLink MX+ r3.2.1\r>",
            "STPBRR": "500000\r>",
            "STM 16": self.traffic,
            "": "STOPPED\r>",
        }.get(command, "OK\r>")
        if command == self.fail:
            response = "?\r>"
        self.buffer.extend(response.encode())

    def read(self, n):
        if self.buffer:
            return bytes(self.buffer.popleft() for _ in range(min(n, len(self.buffer))))
        time.sleep(0.001)
        return b""

    @property
    def in_waiting(self):
        return len(self.buffer)

    def flush(self):
        pass

    def close(self):
        self.closed = True


def driver(fake):
    return OBDLinkTransport(
        ConnectionConfig(kind="obdlink", port="COM8"),
        "test",
        serial_factory=lambda **kwargs: fake,
        command_timeout=0.05,
    )


@pytest.mark.parametrize("chunk_size", [1, 7, 4096])
def test_receive_preserves_frames_across_serial_chunks(chunk_size):
    fake = FakeSerial(traffic="123 2 00 FF\r\n18 FF 50 10 1 AB\r7FF 0\r")
    original_read = fake.read
    fake.read = lambda n: original_read(min(n, chunk_size))
    transport = driver(fake)
    transport.connect()
    frames = []
    transport.start(frames.append, lambda *event: None)
    wait_until(lambda: len(frames) == 3)
    transport.disconnect()
    assert [(f.arbitration_id, f.data) for f in frames] == [
        (0x123, b"\x00\xff"),
        (0x18FF5010, b"\xab"),
        (0x7FF, b""),
    ]
    assert transport.counters["parse_errors"] == 0


@pytest.mark.parametrize("chunk_size", [1, 4096])
def test_buffer_full_consumes_prompt_without_idle_interrupt(chunk_size):
    fake = FakeSerial(traffic="123 2 00 FF\rBUFFER FULL\r\r>")
    original_read = fake.read
    fake.read = lambda n: original_read(min(n, chunk_size))
    transport = driver(fake)
    transport.connect()
    frames, events = [], []
    transport.start(frames.append, lambda *event: events.append(event))
    wait_until(lambda: transport.thread and not transport.thread.is_alive())
    assert len(frames) == 1
    assert transport.counters["buffer_overflows"] == 1
    assert transport.prompt_ready and not transport.monitoring
    assert not fake.buffer
    assert fake.closed
    with pytest.raises(RuntimeError):
        transport.start(frames.append, lambda *event: None)
    transport.disconnect()
    assert fake.closed and b" " not in fake.writes
    assert any(event == ("error", "BUFFER FULL") for event in events)


def test_buffer_full_missing_prompt_closes_without_commands():
    fake = FakeSerial(traffic="BUFFER FULL\r")
    transport = driver(fake)
    transport.connect()
    events = []
    transport.start(lambda frame: None, lambda *event: events.append(event))
    wait_until(lambda: transport.thread and not transport.thread.is_alive())
    assert not transport.prompt_ready and not transport.connected
    assert fake.closed
    transport.disconnect()
    assert fake.closed and fake.writes[-1] == b"STM 16\r"
    assert any(event[0] == "warning" for event in events)


def test_lifecycle_whitelist_and_stop():
    fake = FakeSerial()
    transport = driver(fake)
    transport.connect()
    with pytest.raises(RuntimeError):
        transport.connect()
    frames, events = [], []
    transport.start(frames.append, lambda *e: events.append(e))
    wait_until(lambda: len(frames) == 1)
    with pytest.raises(RuntimeError):
        transport.start(frames.append, lambda *e: None)
    transport.stop()
    assert fake.writes[-1] == b" "
    assert not transport.monitoring
    for data in fake.writes[:-1]:
        assert data.decode().strip() in WHITELIST
    assert fake.writes.index(b"STCMM 0\r") < fake.writes.index(b"STM 16\r")
    assert fake.writes.index(b"STP 31\r") < fake.writes.index(b"ATCM 00000000\r")
    assert b"STMA\r" not in fake.writes
    for command in ("010C", "ATSH 123", "ATCMM 1", "STCMM 1", "STM\r010C", "STM", "STM 32767", "ATZ", ""):
        with pytest.raises(ValueError):
            transport._write_command(command)
    transport.disconnect()
    transport.disconnect()
    assert fake.closed


@pytest.mark.parametrize("command", ["STCMM 0", "STP 31", "STFPA 0000,0000", "ATD1"])
def test_failed_configuration_never_starts(command):
    fake = FakeSerial(fail=command)
    transport = driver(fake)
    transport.connect()
    with pytest.raises(RuntimeError):
        transport.start(lambda f: None, lambda *e: None)
    assert b"STM 16\r" not in fake.writes
    transport.disconnect()


def test_timeout():
    fake = FakeSerial()
    fake.write = lambda data: fake.writes.append(data)
    transport = driver(fake)
    with pytest.raises(TimeoutError):
        transport.connect()
    assert fake.writes == [b"ATI\r"] and fake.closed


@pytest.mark.parametrize(
    "traffic,overflows,errors",
    [
        ("BUFFER FULL\r>", 1, 0),
        ("UART RX OVERFLOW\r>", 1, 0),
        ("not a frame\r123 2 00 FF\r", 0, 1),
        ("CAN ERROR\r>", 0, 0),
    ],
)
def test_stream_errors(traffic, overflows, errors):
    fake = FakeSerial(traffic=traffic)
    transport = driver(fake)
    transport.connect()
    events = []
    transport.start(lambda f: None, lambda *e: events.append(e))
    wait_until(lambda: transport.counters["parse_errors"] or any(e[0] == "error" for e in events))
    assert transport.counters["buffer_overflows"] == overflows
    assert transport.counters["parse_errors"] == errors
    transport.disconnect()


def test_stop_timeout_prevents_restart():
    fake = FakeSerial(traffic="")
    transport = driver(fake)
    transport.connect()
    transport.start(lambda f: None, lambda *e: None)
    fake.write = lambda data: fake.writes.append(data)
    with pytest.raises(TimeoutError):
        transport.stop()
    assert fake.writes[-1] == b" "
    with pytest.raises(RuntimeError):
        transport.start(lambda f: None, lambda *e: None)
    transport.disconnect()


def test_port_busy():
    def busy(**kwargs):
        raise OSError("COM port is busy")

    transport = OBDLinkTransport(ConnectionConfig(kind="obdlink", port="COM8"), "test", serial_factory=busy)
    with pytest.raises(OSError, match="busy"):
        transport.connect()
    assert not transport.connected and transport.serial is None


def test_wrong_adapter_identity():
    fake = FakeSerial()
    original = fake.write

    def write(data):
        if data == b"STDI\r":
            fake.writes.append(data)
            fake.buffer.extend(b"Other adapter\r>")
        else:
            original(data)

    fake.write = write
    with pytest.raises(RuntimeError, match="identify"):
        driver(fake).connect()
    assert fake.closed and fake.writes == [b"ATI\r", b"STDI\r"]


def test_bitrate_mismatch_aborts_before_stm():
    fake = FakeSerial()
    original = fake.write

    def write(data):
        if data == b"STPBRR\r":
            fake.writes.append(data)
            fake.buffer.extend(b"250000\r>")
        else:
            original(data)

    fake.write = write
    transport = driver(fake)
    transport.connect()
    with pytest.raises(RuntimeError, match="bitrate mismatch"):
        transport.start(lambda f: None, lambda *e: None)
    assert b"STM 16\r" not in fake.writes
    transport.disconnect()


def test_serial_disconnect_is_reported():
    fake = FakeSerial(traffic="")
    transport = driver(fake)
    transport.connect()
    events = []
    transport.start(lambda f: None, lambda *e: events.append(e))

    def disconnected(n):
        raise OSError("Bluetooth disconnected")

    fake.read = disconnected
    wait_until(lambda: any(e[0] == "error" for e in events))
    assert not transport.connected
    # A failed link cannot acknowledge STM exit; closing still releases the handle.
    with pytest.raises(OSError):
        transport.disconnect()
    assert fake.closed


def test_bounded_batches_repeat_only_after_normal_completion():
    fake = FakeSerial(traffic="123200FF\r" * 16 + ">")
    transport = driver(fake)
    transport.connect()
    frames = []
    transport.start(frames.append, lambda *event: None)
    wait_until(lambda: len(frames) >= 32)
    transport.stop()
    written = list(fake.writes)
    time.sleep(0.15)
    assert fake.writes == written
    assert fake.writes.count(b"STM 16\r") >= 2
    assert b"ATS0\r" in fake.writes
    assert b"STM\r" not in fake.writes
    assert transport.counters["parse_errors"] == 0
    assert transport.connected and not transport.monitoring
    transport.disconnect()


def test_stop_between_batches_does_not_interrupt_idle_adapter():
    fake = FakeSerial(traffic="1230\r" * 16 + ">")
    transport = driver(fake)
    transport.connect()
    transport.start(lambda frame: None, lambda *event: None)
    wait_until(lambda: transport.prompt_ready and not transport.monitoring)
    transport.stop()
    assert fake.writes.count(b"STM 16\r") == 1
    assert b" " not in fake.writes
    transport.disconnect()


def test_partial_batch_prompt_never_restarts():
    fake = FakeSerial(traffic="1230\r>")
    transport = driver(fake)
    transport.connect()
    events = []
    transport.start(lambda frame: None, lambda *event: events.append(event))
    wait_until(lambda: not transport.connected)
    assert any("Incomplete monitor batch" in e[1] for e in events)
    assert fake.writes.count(b"STM 16\r") == 1
    transport.disconnect()
