import asyncio
import json
import time

from fastapi.testclient import TestClient

from backend.analysis.aggregate import Aggregator
from backend.api.app import create_app
from backend.capture.service import CaptureService
from backend.models import CANFrame, RecordingRequest
from backend.storage.sessions import SessionStore
from backend.transports.replay import ReplayTransport
from backend.vehicles.registry import RawDecoder
from tests.conftest import wait_until
from tests.mock_app import create_mock_app


def test_aggregation_and_bounds(frame):
    agg = Aggregator(max_ids=2)
    agg.add(frame, arrival=1)
    agg.add(frame.model_copy(update={"data": b"\x01\xff"}), arrival=1.1)
    row = agg.snapshot(1.2)[0]
    assert row.count == 2 and row.hz == 10
    assert row.changed_at[0] > 0 and row.changed_at[1] == 0
    assert agg.active_count(1.5) == 1
    assert agg.active_count(4) == 0
    for i in (0x200, 0x300):
        agg.add(frame.model_copy(update={"arbitration_id": i}))
    assert len(agg.rows) == 2 and agg.evictions == 1


def test_queue_overflow_and_bounded_subscriber(frame):
    async def exercise():
        service = CaptureService(queue_size=2)
        for _ in range(100):
            service.emit(frame)
        assert service.queue.qsize() == 2 and service.stats.queue_drops == 98
        subscriber = asyncio.Queue(maxsize=1)
        service.subscribers.add(subscriber)
        service.interval = 0.05
        task = asyncio.create_task(service.run())
        await asyncio.sleep(0.25)
        service.running = False
        await task
        assert service.stats.ws_drops >= 1
        assert subscriber.qsize() == 1 and service.aggregate.snapshot(time.monotonic())[0].count == 2

    asyncio.run(exercise())


def test_storage_replay_roundtrip_and_traversal(tmp_path, frame):
    store = SessionStore(tmp_path)
    service = CaptureService(store)
    metadata = store.start(RecordingRequest(name="roundtrip", notes="original bytes"), service.status())
    frames = [frame, frame.model_copy(update={"timestamp_monotonic": frame.timestamp_monotonic + 0.01})]
    store.append(frames, service.stats)
    store.stop()
    path = store.path_for(metadata["recording_id"])
    saved = [CANFrame.model_validate_json(line) for line in path.read_text().splitlines()]
    assert saved == frames
    assert json.loads(path.read_text().splitlines()[0])["data"] == "00FF"
    replay = ReplayTransport(path, "playback-session")
    replay.connect()
    output, events = [], []
    replay.start(output.append, lambda *event: events.append(event))
    wait_until(lambda: events)
    replay.disconnect()
    assert len(output) == 2
    assert output[0].data == frame.data and output[0].is_simulated
    assert output[0].timestamp_utc == frame.timestamp_utc
    assert output[0].origin_session_id == frame.session_id
    assert output[0].session_id == "playback-session"
    import pytest

    with pytest.raises(ValueError):
        store.path_for("../../etc/passwd")
    store.close()


def test_replay_long_wait_is_interruptible(tmp_path, frame):
    path = tmp_path / "long.ndjson"
    path.write_text(
        frame.model_dump_json()
        + "\n"
        + frame.model_copy(update={"timestamp_monotonic": frame.timestamp_monotonic + 3600}).model_dump_json()
        + "\n"
    )
    transport = ReplayTransport(path, "replay")
    transport.connect()
    output = []
    transport.start(output.append, lambda *e: None)
    wait_until(lambda: output)
    start = time.monotonic()
    transport.stop()
    assert time.monotonic() - start < 0.5 and len(output) == 1


def test_replay_invalid_file(tmp_path):
    path = tmp_path / "invalid.ndjson"
    path.write_text('{"bad":true}\n')
    transport = ReplayTransport(path, "replay")
    transport.connect()
    events = []
    transport.start(lambda f: None, lambda *e: events.append(e))
    wait_until(lambda: events)
    assert events[0][0] == "error"
    transport.disconnect()


def test_full_mock_api_workflow(tmp_path):
    app = create_mock_app(tmp_path)
    with TestClient(app) as client:
        wait_until(lambda: client.get("/api/status").json()["stats"]["received_frames"] > 5)
        assert client.post("/api/connect", json={"kind": "obdlink", "port": "COM999"}).status_code == 409
        assert client.post("/api/capture/start", json={}).status_code == 409
        profiles = client.get("/api/profiles").json()
        assert {p["id"] for p in profiles} == {"generic"}
        original_config = client.get("/api/status").json()["config"]
        assert client.post("/api/profiles/select", json={"profile_id": "byd-dolphin-jp"}).status_code == 404
        assert client.get("/api/status").json()["profile_id"] == "generic"
        assert client.get("/api/status").json()["config"] == original_config
        assert RawDecoder().decode(None, None) == {}
        assert client.post("/api/mock/scenario", json={"button": True}).status_code == 404
        with client.websocket_connect("/ws") as ws:
            message = ws.receive_json()
            assert message["type"] == "snapshot"
            for _ in range(3):
                message = ws.receive_json()
            assert message["rows"] and all(row["frame"]["is_simulated"] for row in message["rows"])
        recording = client.post(
            "/api/recording/start", json={"name": "integration", "notes": "no browser"}
        ).json()
        time.sleep(0.3)  # No WebSocket subscribers while recording.
        assert client.post("/api/recording/stop", json={}).status_code == 200
        session = client.get("/api/sessions").json()[0]
        assert session["frame_count"] > 0 and session["status"] == "complete"
        export = client.get(f"/api/sessions/{recording['recording_id']}/export")
        assert export.status_code == 200 and export.headers["content-type"].startswith("application/x-ndjson")
        assert CANFrame.model_validate_json(export.text.splitlines()[0]).is_simulated
        assert client.post("/api/capture/stop", json={}).status_code == 200
        count = client.get("/api/status").json()["stats"]["received_frames"]
        time.sleep(0.1)
        assert client.get("/api/status").json()["stats"]["received_frames"] == count
        assert client.post("/api/disconnect", json={}).status_code == 200
        assert (
            client.post(
                "/api/connect",
                json={"kind": "replay", "replay_session_id": session["id"], "replay_speed": 10},
            ).status_code
            == 200
        )
        assert client.post("/api/capture/start", json={}).status_code == 200
        wait_until(lambda: client.get("/api/status").json()["state"] == "connected")
        assert client.get("/api/status").json()["stats"]["received_frames"] == session["frame_count"]
        assert client.post("/api/disconnect", json={}).status_code == 200
        assert client.post("/api/connect", json={"kind": "obdlink", "port": "COM999"}).status_code == 200
        assert client.post("/api/capture/start", json={}).status_code == 200


def test_hardware_guard_and_security(tmp_path, monkeypatch):
    monkeypatch.setenv("CAN_ENABLE_HARDWARE", "0")
    app = create_app(tmp_path)
    with TestClient(app) as client:
        assert client.post("/api/connect", json={"kind": "obdlink", "port": "COM8"}).status_code == 409
        assert client.post("/api/connect", json={"kind": "mock", "command": "010C"}).status_code == 422
        assert client.post("/api/connect", json={"kind": "obdlink", "port": "COM8\r010C"}).status_code == 422
        assert (
            client.post(
                "/api/connect", json={"kind": "mock"}, headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
        assert client.get("/api/status", headers={"Host": "evil.example"}).status_code == 400
        paths = client.get("/openapi.json").json()["paths"]
        assert not any(word in path for path in paths for word in ("/send", "/command", "/pid"))
        assert client.get("/api/sessions/nonexistent/export").status_code == 404


def test_storage_failure_is_visible_and_stops_recording(tmp_path, monkeypatch):
    app = create_mock_app(tmp_path)
    with TestClient(app) as client:
        client.post("/api/recording/start", json={"name": "disk full"})

        def fail(*args):
            raise OSError("disk full")

        monkeypatch.setattr(app.state.capture.store, "append", fail)
        wait_until(lambda: client.get("/api/status").json()["stats"]["storage_errors"] > 0)
        status = client.get("/api/status").json()
        assert status["recording_id"] is None and "disk full" in status["last_error"]
        assert client.get("/api/sessions").json()[0]["status"] == "error"


def test_mock_repeat_connect_start_stop():
    from tests.mock_transport import MockTransport

    transport = MockTransport("cycles")
    output = []
    for _ in range(5):
        transport.connect()
        transport.start(output.append, lambda *e: None)
        before = len(output)
        wait_until(lambda: len(output) > before)
        transport.stop()
        count = len(output)
        time.sleep(0.02)
        assert len(output) == count
        transport.disconnect()
    assert all(f.is_simulated for f in output)


def test_recovery_marks_interrupted_session(tmp_path):
    store = SessionStore(tmp_path)
    service = CaptureService(store)
    store.start(RecordingRequest(name="interrupted"), service.status())
    store.file.close()
    store.db.close()  # Simulate a process ending without stop().
    recovered = SessionStore(tmp_path)
    assert recovered.list_sessions()[0]["status"] == "interrupted"
    recovered.close()


def test_websocket_rejects_external_origin(tmp_path):
    import pytest
    from starlette.websockets import WebSocketDisconnect

    with TestClient(create_app(tmp_path)) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws", headers={"Origin": "https://evil.example"}):
                pass


def test_hardware_launcher_defaults_to_idle_without_mock_or_recording(tmp_path, monkeypatch):
    monkeypatch.setenv("CAN_ENABLE_HARDWARE", "1")
    monkeypatch.setenv("CAN_DEFAULT_SOURCE", "obdlink")
    monkeypatch.setenv("CAN_AUTOSTART_MOCK", "0")
    with TestClient(create_app(tmp_path)) as client:
        state = client.get("/api/status").json()
        assert state["config"]["kind"] == "obdlink"
        assert state["state"] == "disconnected"
        assert state["recording_id"] is None
        assert state["stats"]["received_frames"] == 0
        assert client.get("/api/sessions").json() == []


def test_production_rejects_mock_even_with_legacy_autostart_setting(tmp_path, monkeypatch):
    monkeypatch.setenv("CAN_AUTOSTART_MOCK", "1")
    with TestClient(create_app(tmp_path)) as client:
        state = client.get("/api/status").json()
        assert state["state"] == "disconnected"
        assert state["stats"]["received_frames"] == 0
        assert client.post("/api/connect", json={"kind": "mock"}).status_code == 422
        assert client.post("/api/mock/scenario", json={"button": True}).status_code == 404
        schema = client.get("/openapi.json").json()
        assert schema["components"]["schemas"]["ConnectionConfig"]["properties"]["kind"]["enum"] == [
            "obdlink",
            "replay",
        ]
