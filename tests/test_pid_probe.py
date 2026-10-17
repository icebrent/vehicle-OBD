import pytest
from fastapi.testclient import TestClient

from backend.api.app import create_app
from backend.protocols.pid_probe import StandardPIDProbe, parse_responses
from tests.test_obdlink import FakeSerial, driver


def test_support_discovery_and_only_advertised_samples():
    fake = FakeSerial()
    original = fake.write
    replies = {
        "0100": "7E8 06 41 00 00 18 00 00\r>",  # Engine RPM and vehicle speed only.
        "010C": "7E8 04 41 0C 1F 40 00 00 00\r>",
        "010D": "7E8 03 41 0D 00 00 00 00 00\r>",
    }

    def write(data):
        command = data.decode().strip()
        if command in replies:
            fake.writes.append(data)
            fake.buffer.extend(replies[command].encode())
        else:
            original(data)

    fake.write = write
    transport = driver(fake)
    transport.connect()
    waits = []
    report = StandardPIDProbe(transport, sleep=waits.append).run()
    assert report.outcome == "responded"
    assert report.support[0].pids == ["010C", "010D"]
    assert [(v.pid, v.value) for v in report.values] == [("010C", 2000), ("010D", 0)]
    assert report.requests_sent == ["0100", "010C", "010D"]
    assert len(waits) == 2 and all(1.9 < w <= 2 for w in waits)
    assert b"0142\r" not in fake.writes
    assert b"STCMM 1\r" not in fake.writes
    assert fake.writes[-1] == b"STPTRQ 1\r"
    transport.disconnect()


def test_no_data_stops_after_one_request():
    fake = FakeSerial()
    original = fake.write

    def write(data):
        if data == b"0100\r":
            fake.writes.append(data)
            fake.buffer.extend(b"NO DATA\r>")
        else:
            original(data)

    fake.write = write
    transport = driver(fake)
    transport.connect()
    report = StandardPIDProbe(transport).run()
    assert report.outcome == "no_response" and report.requests_sent == ["0100"]
    assert not report.values
    transport.disconnect()


def test_maximum_request_budget_and_no_unsupported_page():
    fake = FakeSerial()
    original = fake.write

    def write(data):
        command = data.decode().strip()
        if command.startswith("01"):
            fake.writes.append(data)
            pid = int(command[2:], 16)
            value = "00 00" if pid in (0x0C, 0x42) else "00" if pid == 0x0D else "FF FF FF FF"
            count = len(value.split()) + 2
            fake.buffer.extend(f"7E8 {count:02X} 41 {pid:02X} {value}\r>".encode())
        else:
            original(data)

    fake.write = write
    transport = driver(fake)
    transport.connect()
    report = StandardPIDProbe(transport, sleep=lambda seconds: None).run()
    assert len(report.requests_sent) == 10
    assert "01E0" not in report.requests_sent
    assert len(report.values) == 3
    transport.disconnect()


@pytest.mark.parametrize("command", ["04", "0902", "220009", "010C\r04", "STPX", "", "0105"])
def test_probe_whitelist_rejects_other_requests(command):
    fake = FakeSerial()
    transport = driver(fake)
    with pytest.raises(ValueError, match="whitelist"):
        StandardPIDProbe(transport).exchange(command)
    assert fake.writes == []


@pytest.mark.parametrize(
    "text",
    [
        "7E8 10 14 41 00 00 00 00 00\r>",  # multi-frame: never send flow control
        "7E8 06 41 00 00\r>",
        "7E8 03 7F 01 11\r>",
        "7E8 03 41 0D 00\r>",
        "BUFFER FULL\r>",
        "CAN ERROR\r>",
    ],
)
def test_bad_or_unexpected_responses_abort(text):
    with pytest.raises(ValueError):
        parse_responses(text, "0100")


def test_timeout_closes_link_without_restore_or_more_requests():
    fake = FakeSerial()
    transport = driver(fake)
    transport.connect()
    probe = StandardPIDProbe(transport)
    original = probe.exchange

    def exchange(command):
        if command == "0100":
            fake.writes.append(b"0100\r")
            probe.synchronized = False
            raise TimeoutError("test timeout")
        return original(command)

    probe.exchange = exchange
    with pytest.raises(TimeoutError):
        probe.run()
    assert fake.writes[-1] == b"0100\r" and fake.closed and not transport.connected


def test_active_capture_is_never_reused_for_queries():
    fake = FakeSerial()
    transport = driver(fake)
    transport.connected = True
    transport.monitoring = True
    with pytest.raises(RuntimeError, match="Stop passive"):
        StandardPIDProbe(transport).run()
    assert not fake.writes


def test_api_requires_connection_and_has_no_arbitrary_request(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/api/obd/report").json() is None
        assert client.post("/api/obd/probe", json={}).status_code == 409
        assert client.post("/api/obd/send", json={"command": "04"}).status_code == 404
