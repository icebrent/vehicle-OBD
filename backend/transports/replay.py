import threading
from pathlib import Path

from backend.models import CANFrame
from backend.transports.base import Transport


class ReplayTransport(Transport):
    def __init__(self, path: Path, session_id: str, speed=1.0):
        self.path = path
        self.session_id = session_id
        self.speed = speed
        self.connected = False
        self.halt = threading.Event()
        self.thread = None

    def connect(self):
        if self.connected:
            raise RuntimeError("Already connected")
        if not self.path.is_file():
            raise ValueError("Replay file not found")
        self.connected = True

    def start(self, emit, event):
        if not self.connected or (self.thread and self.thread.is_alive()):
            raise RuntimeError("Invalid replay start state")
        self.halt.clear()
        self.thread = threading.Thread(target=self._run, args=(emit, event), daemon=True)
        self.thread.start()

    def _run(self, emit, event):
        previous = None
        try:
            with self.path.open(encoding="utf-8") as source:
                line_number = 0
                while not self.halt.is_set():
                    # A corrupt external file cannot cause an unbounded readline allocation.
                    line = source.readline(65537)
                    if not line:
                        break
                    line_number += 1
                    if len(line) > 65536:
                        raise ValueError(f"Replay line {line_number} too long")
                    frame = CANFrame.model_validate_json(line)
                    if previous is not None:
                        delay = max(0, frame.timestamp_monotonic - previous) / self.speed
                        if self.halt.wait(delay):
                            return
                    previous = frame.timestamp_monotonic
                    emit(
                        frame.model_copy(
                            update={
                                "session_id": self.session_id,
                                "adapter_id": "replay",
                                "origin_session_id": frame.origin_session_id or frame.session_id,
                            }
                        )
                    )
            event("eof", "Replay complete")
        except Exception as exc:
            event("error", f"Replay failed: {exc}")

    def stop(self):
        self.halt.set()
        if self.thread:
            self.thread.join(timeout=3)
            if self.thread.is_alive():
                raise TimeoutError("Replay thread did not stop")

    def disconnect(self):
        self.stop()
        self.connected = False
