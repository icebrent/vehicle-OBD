import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path


class SessionStore:
    """One ordered writer, off the asyncio event loop. SQLite indexes raw NDJSON sessions."""

    def __init__(self, directory: Path):
        self.directory = directory.resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.directory / "sessions.sqlite3", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.db.execute("""CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY, name TEXT, notes TEXT, started_at TEXT, ended_at TEXT,
            source TEXT, profile_id TEXT, frame_count INTEGER DEFAULT 0,
            status TEXT, config TEXT, quality TEXT DEFAULT '{}')""")
        self.db.execute("UPDATE sessions SET status='interrupted' WHERE status='recording'")
        self.db.commit()
        self.recording_id = None
        self.recording_name = ""
        self.file = None
        self.frame_count = 0

    def audit(self, entry):
        try:
            with self.lock, (self.directory / "audit.ndjson").open("a", encoding="utf-8") as file:
                file.write(entry.model_dump_json() + "\n")
        except OSError:
            pass  # In-memory diagnostics remain available if disk is full.

    def start(self, request, status):
        with self.lock:
            if self.recording_id:
                raise ValueError("Already recording")
            recording_id = str(uuid.uuid4())
            file = (self.directory / f"{recording_id}.ndjson").open("x", encoding="utf-8")
            try:
                self.db.execute(
                    """INSERT INTO sessions
                    (id,name,notes,started_at,source,profile_id,status,config)
                    VALUES (?,?,?,?,?,?,?,?)""",
                    (
                        recording_id,
                        request.name,
                        request.notes,
                        datetime.now(timezone.utc).isoformat(),
                        status.config.kind,
                        status.profile_id,
                        "recording",
                        status.config.model_dump_json(),
                    ),
                )
                self.db.commit()
            except Exception:
                file.close()
                raise
            self.recording_id = recording_id
            self.recording_name = request.name
            self.file = file
            self.frame_count = 0
            return {"recording_id": recording_id}

    def append(self, frames, stats):
        with self.lock:
            if self.file:
                # Frames retain the capture session identity; file name is the recording identity.
                self.file.writelines(frame.model_dump_json() + "\n" for frame in frames)
                self.file.flush()
                self.frame_count += len(frames)
                quality = {
                    key: getattr(stats, key)
                    for key in ("queue_drops", "buffer_overflows", "parse_errors", "storage_errors")
                }
                self.db.execute(
                    "UPDATE sessions SET frame_count=?,quality=? WHERE id=?",
                    (self.frame_count, json.dumps(quality), self.recording_id),
                )
                self.db.commit()

    def stop(self, status="complete", stats=None):
        with self.lock:
            if self.file:
                recording_id = self.recording_id
                self.recording_id = None
                try:
                    self.file.close()
                finally:
                    self.file = None
                    if stats is not None:
                        quality = {
                            key: getattr(stats, key)
                            for key in ("queue_drops", "buffer_overflows", "parse_errors", "storage_errors")
                        }
                        self.db.execute(
                            "UPDATE sessions SET quality=? WHERE id=?",
                            (json.dumps(quality), recording_id),
                        )
                    self.db.execute(
                        "UPDATE sessions SET ended_at=?,status=?,frame_count=? WHERE id=?",
                        (datetime.now(timezone.utc).isoformat(), status, self.frame_count, recording_id),
                    )
                    self.db.commit()
                    self.recording_id = None

    def list_sessions(self):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM sessions ORDER BY started_at DESC")]

    def path_for(self, session_id):
        with self.lock:
            row = self.db.execute("SELECT id FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not row:
                raise ValueError("Session not found")
            path = self.directory / f"{row['id']}.ndjson"
            if not path.is_file():
                raise ValueError("Raw data file missing")
            if session_id == self.recording_id:
                raise ValueError("Stop recording before replay")
            return path

    def close(self):
        self.stop()
        self.db.close()
