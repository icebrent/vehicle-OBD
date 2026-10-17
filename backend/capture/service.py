import asyncio
import os
import queue
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from backend.analysis.aggregate import Aggregator
from backend.models import ConnectionConfig, Diagnostic, Snapshot, Stats, Status
from backend.transports.mock import MockTransport


class CaptureService:
    def __init__(self, store=None, profiles=None, queue_size=None):
        self.store = store
        self.profiles = profiles
        self.config = ConnectionConfig(kind=os.getenv("CAN_DEFAULT_SOURCE", "mock"))
        self.profile_id = "generic"
        self.state = "disconnected"
        self.transport = None
        self.session_id = None
        self.last_error = None
        self.queue = queue.Queue(maxsize=queue_size or int(os.getenv("CAN_QUEUE_SIZE", "8192")))
        if self.queue.maxsize < 1:
            raise ValueError("CAN_QUEUE_SIZE must be positive")
        self.events = queue.Queue(maxsize=256)
        self.stats = Stats()
        self.aggregate = Aggregator()
        self.logs = deque(maxlen=500)
        self.pending = deque(maxlen=2048)
        self.recent = deque(maxlen=100000)
        self.subscribers = set()
        self.sequence = 0
        self.running = False
        self.lock = asyncio.Lock()
        self.interval = min(2.0, max(0.05, float(os.getenv("CAN_WS_INTERVAL", ".1"))))
        self.hardware_enabled = os.getenv("CAN_ENABLE_HARDWARE", "0") == "1"

    def log(self, level, message):
        entry = Diagnostic(timestamp=datetime.now(timezone.utc), level=level, message=message)
        self.logs.append(entry)
        if self.store:
            self.store.audit(entry)

    def event(self, level, message):
        try:
            self.events.put_nowait((level, message))
        except queue.Full:
            self.stats.queue_drops += 1

    def emit(self, frame):
        arrival = time.monotonic()
        self.stats.received_frames += 1
        self.recent.append(arrival)
        try:
            self.queue.put_nowait((frame, arrival))
        except queue.Full:
            self.stats.queue_drops += 1

    async def connect(self, config):
        if self.state != "disconnected":
            raise ValueError("Disconnect the current data source first")
        while not self.events.empty():
            self.events.get_nowait()
        self.config = config
        self.session_id = str(uuid.uuid4())
        if config.kind == "mock":
            transport = MockTransport(self.session_id)
        elif config.kind == "obdlink":
            if not self.hardware_enabled:
                raise ValueError(
                    "Hardware access is locked. After manual confirmation, set CAN_ENABLE_HARDWARE=1 and restart"
                )
            if not config.port:
                raise ValueError("Select a COM port")
            from backend.transports.obdlink import OBDLinkTransport

            transport = OBDLinkTransport(config, self.session_id)
        else:
            from backend.transports.replay import ReplayTransport

            if not self.store or not config.replay_session_id:
                raise ValueError("Select a recorded session")
            transport = ReplayTransport(
                self.store.path_for(config.replay_session_id), self.session_id, config.replay_speed
            )
        try:
            if hasattr(transport, "event"):
                transport.event = self.event
            await asyncio.to_thread(transport.connect)
        except Exception:
            await asyncio.to_thread(transport.disconnect)
            raise
        self.transport = transport
        self.config = config
        self.stats = Stats()
        self.aggregate = Aggregator()
        self.pending.clear()
        self.recent.clear()
        self.last_error = None
        self.state = "connected"
        self.log("info", f"Connected: {config.kind}")

    async def start(self):
        if self.state != "connected":
            raise ValueError("Connect a source first; capture must not already be running")
        try:
            await asyncio.to_thread(self.transport.start, self.emit, self.event)
            self.state = "listening"
        except Exception as exc:
            self.state = "error"
            self.last_error = str(exc)
            self.log("error", str(exc))
            raise

    async def stop(self):
        if self.transport:
            try:
                await asyncio.to_thread(self.transport.stop)
            except Exception as exc:
                self.state = "error"
                self.last_error = str(exc)
                self.log("error", str(exc))
                raise
            while await self.drain():
                pass
            self.state = "connected" if getattr(self.transport, "connected", True) else "error"
            self.stats.fps = 0
            self.recent.clear()
        self.log("info", "Capture stopped; ingress queue drained")

    async def disconnect(self):
        failure = None
        try:
            await self.stop()
        except Exception as exc:
            failure = exc
        finally:
            try:
                if self.transport:
                    await asyncio.to_thread(self.transport.disconnect)
            except Exception as exc:
                failure = failure or exc
            finally:
                try:
                    if self.store:
                        await asyncio.to_thread(self.store.stop, "complete", self.stats)
                finally:
                    self.transport = None
                    self.state = "disconnected"
        if failure:
            raise failure

    async def drain_boundary(self):
        """Drain only the frames already queued at the recording boundary."""
        remaining = self.queue.qsize()
        while remaining > 0:
            processed = await self.drain(min(remaining, 2048))
            if not processed:
                break
            remaining -= processed

    async def drain(self, limit=2048):
        batch = []
        arrivals = []
        for _ in range(limit):
            try:
                frame, arrival = self.queue.get_nowait()
                batch.append(frame)
                arrivals.append(arrival)
            except queue.Empty:
                break
        for frame, arrival in zip(batch, arrivals):
            self.aggregate.add(frame, arrival=arrival)
            if len(self.pending) == self.pending.maxlen:
                self.stats.ws_drops += 1
            self.pending.append(frame)
        if batch and self.store and self.store.recording_id:
            try:
                await asyncio.to_thread(self.store.append, batch, self.stats)
            except Exception as exc:
                self.stats.storage_errors += 1
                self.log("error", f"Recording failed: {exc}")
                self.last_error = f"Recording failed: {exc}"
                try:
                    await asyncio.to_thread(self.store.stop, "error", self.stats)
                except Exception as finalize_error:
                    self.log("error", f"Recording metadata finalization failed: {finalize_error}")
        return len(batch)

    def status(self):
        now = time.monotonic()
        if self.transport and hasattr(self.transport, "counters"):
            for key, value in self.transport.counters.items():
                setattr(self.stats, key, value)
        else:
            self.stats.parsed_frames = self.stats.received_frames
        self.stats.active_ids = self.aggregate.active_count(now)
        self.stats.analysis_evictions = self.aggregate.evictions
        return Status(
            state=self.state,
            config=self.config,
            capture_session_id=self.session_id,
            recording_id=self.store.recording_id if self.store else None,
            session_name=self.store.recording_name
            if self.store and self.store.recording_id
            else "Live observation",
            profile_id=self.profile_id,
            hardware_enabled=self.hardware_enabled,
            last_error=self.last_error,
            stats=self.stats.model_copy(),
        )

    def snapshot(self, frames=None):
        return Snapshot(
            sequence=self.sequence,
            status=self.status(),
            rows=self.aggregate.snapshot(time.monotonic()),
            frames=frames or [],
        )

    async def run(self):
        self.running = True
        last_push = time.monotonic()
        while self.running:
            async with self.lock:
                await self.drain()
                while not self.events.empty():
                    level, message = self.events.get_nowait()
                    self.log(level, message)
                    if level == "error":
                        self.last_error = message
                        self.state = "error"
                    elif level == "eof" and self.state == "listening":
                        self.state = "connected"
                now = time.monotonic()
                while self.recent and now - self.recent[0] > 1:
                    self.recent.popleft()
                self.stats.fps = len(self.recent) if self.state == "listening" else 0
                if now - last_push >= self.interval:
                    self.sequence += 1
                    payload = self.snapshot(list(self.pending)).model_dump_json()
                    self.pending.clear()
                    for subscriber in self.subscribers.copy():
                        if subscriber.full():
                            subscriber.get_nowait()
                            self.stats.ws_drops += 1
                        subscriber.put_nowait(payload)
                    last_push = now
            await asyncio.sleep(0.01)

    async def close(self):
        async with self.lock:
            await self.disconnect()
            self.running = False
