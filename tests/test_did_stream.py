# All response fixtures in this file are synthetic, not captured vehicle records.
import pytest
from conftest import wait_until
from test_obdlink import FakeSerial, driver

from backend.capture.diagnostics import DiagnosticService, DIDReplay, DIDStart
from backend.protocols.byd_did import DolphinDIDLink, decode_response


@pytest.mark.parametrize(
    "command,response,signal,value",
    [
        ("220005", "7EF046200053C\r>", "soc", 60),
        ("220008", "7EF056200086801\r>", "voltage", 360),
        ("220009", "7EF05620009A113\r>", "current", 2.5),
        ("220032", "7EF0462003241\r>", "temperature", 25),
        ("220009", "7EF 05 62 00 09 7E 13\r>", "current", -1),
    ],
)
def test_synthetic_responses_decode(command, response, signal, value):
    reading = decode_response(response, command, "test")
    assert reading.signal_id == signal and reading.value == value
    assert reading.raw_response == response and reading.timestamp_source == "pc_receive"


@pytest.mark.parametrize(
    "response", ["NO DATA\r>", "7EF037F2231\r>", "7E8056200055A\r>", "7EF046200085A\r>", "7EF10646200055A\r>"]
)
def test_invalid_response_never_becomes_value(response):
    with pytest.raises(ValueError):
        decode_response(response, "220005", "test")


def test_private_whitelist_never_allows_other_dids():
    fake = FakeSerial()
    transport = driver(fake)
    for command in ("22F190", "1003", "2701", "2E000500", "220005\r04", "0100"):
        with pytest.raises(ValueError):
            DolphinDIDLink(transport).exchange(command)
    assert fake.writes == []


def test_single_response_request_keeps_original_did_and_raw_reply():
    fake = FakeSerial()
    transport = driver(fake)
    transport.serial = fake
    response = "220005 1\r7EF046200053C\r>"

    def write(data):
        fake.writes.append(data)
        fake.buffer.extend(response.encode("ascii"))

    fake.write = write
    reading = DolphinDIDLink(transport).read("220005", "test")
    assert fake.writes == [b"220005 1\r"]
    assert reading.request == "220005" and reading.value == 60
    assert reading.raw_response == response


@pytest.mark.parametrize("save", [False, True])
def test_stream_records_only_after_valid_response_and_stops(tmp_path, save):
    fake = FakeSerial()
    original = fake.write

    def write(data):
        if data == b"220005 1\r":
            fake.writes.append(data)
            fake.buffer.extend(b"7EF046200053C\r>")
        else:
            original(data)

    fake.write = write
    service = DiagnosticService(tmp_path, transport_factory=lambda config, session: driver(fake))
    service.start(DIDStart(port="COM8", save_after_first_response=save))
    wait_until(lambda: service.status().received == 1)
    service.stop()
    assert service.status().state == "stopped" and fake.closed
    assert service.status().received == 1
    sessions = service.store.sessions()
    assert len(sessions) == int(save)
    if save:
        assert sessions[0]["count"] == 1
        text = service.store.path_for(sessions[0]["id"]).read_text(encoding="utf-8")
        assert '"raw_response"' in text and '"value":60.0' in text
        service.replay(DIDReplay(recording_id=sessions[0]["id"]))
        wait_until(lambda: service.status().state == "complete")
        assert service.status().received == 1
        assert len(service.store.sessions()) == 1
    service.close()


def test_missing_data_does_not_create_recording(tmp_path):
    fake = FakeSerial()
    original = fake.write

    def write(data):
        if data == b"220005 1\r":
            fake.writes.append(data)
            fake.buffer.extend(b"NO DATA\r>")
        else:
            original(data)

    fake.write = write
    service = DiagnosticService(tmp_path, transport_factory=lambda config, session: driver(fake))
    service.start(DIDStart(port="COM8", save_after_first_response=True))
    wait_until(lambda: service.status().state == "error")
    service.stop()
    assert not service.store.sessions() and fake.writes[-1] == b"220005 1\r"
    service.close()


def test_vehicle_api_is_guarded_and_rejects_arbitrary_commands(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from backend.api.app import create_app

    monkeypatch.setenv("CAN_ENABLE_HARDWARE", "0")
    with TestClient(create_app(tmp_path, autostart=False)) as client:
        assert client.post("/api/vehicle/start", json={"port": "COM8"}).status_code == 409
        assert (
            client.post("/api/vehicle/start", json={"port": "COM8", "command": "220123"}).status_code == 422
        )
        assert client.get("/api/vehicle/sessions/invalid/export").status_code == 422
        assert client.post("/api/vehicle/saving/start", json={"name": "test"}).status_code == 409
        assert client.get("/api/vehicle/status").json()["history"] == []


def test_replay_cancel_is_prompt_and_does_not_open_hardware(tmp_path):
    import time

    service = DiagnosticService(
        tmp_path, transport_factory=lambda *args: pytest.fail("Replay opened hardware")
    )
    reading = decode_response("7EF046200053C\r>", "220005", "test")
    service.store.start("Replay cancellation")
    identity = service.store.recording_id
    service.store.append(reading)
    service.store.append(
        reading.model_copy(update={"timestamp_monotonic": reading.timestamp_monotonic + 600})
    )
    service.store.stop()
    service.replay(DIDReplay(recording_id=identity))
    wait_until(lambda: service.status().received == 1)
    start = time.monotonic()
    service.stop()
    assert time.monotonic() - start < 1
    assert service.status().state == "stopped"
    service.close()


@pytest.mark.parametrize("group", range(1, 11))
def test_module_single_frames_are_decoded_with_identity(group):
    from backend.protocols.byd_did import MODULE_REQUESTS

    expected = [
        ("module_min_voltage", "B20C", 3.25),
        ("module_max_voltage", "BC0C", 3.26),
        ("module_temperature_a", "3F", 23),
        ("module_temperature_b", "3E", 22),
    ]
    for request, (signal, data, value) in zip(MODULE_REQUESTS[group - 1], expected):
        payload = "62" + request[2:] + data
        response = "7EF" + f"{len(payload) // 2:02X}" + payload + "\r>"
        reading = decode_response(response, request, "test")
        assert reading.module_id == group and reading.signal_id == signal
        assert reading.value == pytest.approx(value)
        assert reading.raw_response == response
        with pytest.raises(ValueError):
            type(reading).model_validate(reading.model_dump() | {"module_id": group + 1})


def test_schedule_interleaves_core_and_fixed_groups_and_halts(tmp_path):
    from itertools import islice

    from backend.protocols.byd_did import CORE_REQUESTS, MODULE_REQUESTS

    service = DiagnosticService(tmp_path)
    service.include_modules = True
    schedule = service._requests()
    expected = [item for block in MODULE_REQUESTS for item in (*CORE_REQUESTS, *block)]
    assert list(islice(schedule, 80)) == expected
    assert list(islice(schedule, 8)) == list((*CORE_REQUESTS, *MODULE_REQUESTS[0]))
    service.halt.set()
    assert list(schedule) == []
    service.close()


def test_observation_marker_persists_separately_without_faking_readings(tmp_path):
    import json

    service = DiagnosticService(tmp_path)
    with pytest.raises(ValueError):
        service.store.mark("stationary")
    service.store.start("Actions")
    identity = service.store.recording_id
    marker = service.store.mark("ac_off")
    service.store.stop()
    assert marker["source"] == "operator_annotation"
    path = service.store.directory / f"{identity}.events.ndjson"
    assert json.loads(path.read_text(encoding="utf-8"))["label"] == "ac_off"
    assert service.store.path_for(identity).read_text(encoding="utf-8") == ""
    service.close()
