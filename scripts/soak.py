"""Read-only real HTTP/WebSocket endurance check against an already running Mock backend."""

import argparse
import json
import time
from pathlib import Path

import httpx
from websockets.sync.client import connect


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    with httpx.Client(base_url=args.url, timeout=5) as client:
        initial = client.get("/api/status").json()
        if initial["config"]["kind"] != "mock" or initial["state"] != "listening":
            raise RuntimeError("Start the Mock transport before running this read-only check")
        messages = 0
        max_rows = 0
        first_sequence = None
        last_sequence = None
        start = time.monotonic()
        ws_url = args.url.replace("http", "ws", 1) + "/ws"
        with connect(ws_url, origin="http://127.0.0.1:5173", max_size=8 * 1024 * 1024) as ws:
            while time.monotonic() - start < args.seconds:
                snapshot = json.loads(ws.recv(timeout=5))
                assert snapshot["status"]["config"]["kind"] == "mock"
                assert snapshot["status"]["capture_session_id"] == initial["capture_session_id"]
                assert all(row["frame"]["is_simulated"] for row in snapshot["rows"])
                max_rows = max(max_rows, len(snapshot["rows"]))
                messages += 1
                last_sequence = snapshot["sequence"]
                if first_sequence is None:
                    first_sequence = last_sequence
        before_disconnect = client.get("/api/status").json()["stats"]["received_frames"]
        time.sleep(1)
        final = client.get("/api/status").json()
        assert final["stats"]["received_frames"] > before_disconnect
        assert final["stats"]["queue_drops"] == initial["stats"]["queue_drops"]
        assert final["stats"]["parse_errors"] == 0
        assert messages > args.seconds * 5 and max_rows == 5
        report = {
            "duration_seconds": round(time.monotonic() - start, 2),
            "websocket_messages": messages,
            "first_sequence": first_sequence,
            "last_sequence": last_sequence,
            "max_ids": max_rows,
            "received_frame_delta": final["stats"]["received_frames"] - initial["stats"]["received_frames"],
            "stats": final["stats"],
            "result": "PASS",
        }
        destination = Path(__file__).resolve().parents[1] / ".cache" / "soak-result.json"
        destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
