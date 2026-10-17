import json
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone


class DiagnosticStore:
    """Independent NDJSON format: protocol readings, never fabricated CAN frames."""

    def __init__(self, directory):
        self.directory = directory / "diagnostics"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.directory / "index.sqlite3", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE IF NOT EXISTS recordings (
            id TEXT PRIMARY KEY, name TEXT, started_at TEXT, ended_at TEXT,
            count INTEGER, state TEXT, definition_version TEXT)""")
        self.db.execute("UPDATE recordings SET state='interrupted' WHERE state='recording'")
        self.db.commit()
        self.file = None
        self.recording_id = None
        self.count = 0

    def start(self, name):
        with self.lock:
            if self.file:
                return
            identity = str(uuid.uuid4())
            file = (self.directory / f"{identity}.ndjson").open("x", encoding="utf-8")
            try:
                self.db.execute(
                    "INSERT INTO recordings VALUES (?,?,?,NULL,0,'recording',?)",
                    (
                        identity,
                        name,
                        datetime.now(timezone.utc).isoformat(),
                        "dolphin-community-v1",
                    ),
                )
                self.db.commit()
            except Exception:
                file.close()
                raise
            self.file, self.recording_id, self.count = file, identity, 0

    def append(self, reading):
        with self.lock:
            if not self.file:
                return
            self.file.write(reading.model_dump_json() + "\n")
            self.file.flush()
            self.count += 1
            self.db.execute("UPDATE recordings SET count=? WHERE id=?", (self.count, self.recording_id))
            self.db.commit()

    def stop(self, state="complete"):
        with self.lock:
            if self.file:
                try:
                    self.file.close()
                finally:
                    self.file = None
                    self.db.execute(
                        "UPDATE recordings SET state=?,ended_at=? WHERE id=?",
                        (
                            state,
                            datetime.now(timezone.utc).isoformat(),
                            self.recording_id,
                        ),
                    )
                    self.db.commit()
                    self.recording_id = None

    def mark(self, label):
        with self.lock:
            if not self.recording_id:
                raise ValueError("Start saving before adding an observation marker")
            event = {
                "recording_id": self.recording_id,
                "label": label,
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "timestamp_monotonic": time.monotonic(),
                "source": "operator_annotation",
            }
            path = self.directory / f"{self.recording_id}.events.ndjson"
            with path.open("a", encoding="utf-8") as file:
                file.write(json.dumps(event) + "\n")
            return event

    def sessions(self):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM recordings ORDER BY started_at DESC")]

    def path_for(self, identity):
        # No arbitrary filesystem path can come from the API.
        identity = str(uuid.UUID(identity))
        with self.lock:
            if identity == self.recording_id:
                raise ValueError("Stop saving before replay/export")
            if not self.db.execute("SELECT id FROM recordings WHERE id=?", (identity,)).fetchone():
                raise ValueError("Diagnostic recording not found")
        path = self.directory / f"{identity}.ndjson"
        if not path.is_file():
            raise ValueError("Diagnostic data file missing")
        return path

    def close(self):
        self.stop()
        self.db.close()
