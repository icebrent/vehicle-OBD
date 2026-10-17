import threading
import uuid
from collections import deque
from typing import Literal

from pydantic import Field

from backend.models import ConnectionConfig, Schema
from backend.protocols.byd_did import (
    CORE_REQUESTS,
    MODULE_REQUESTS,
    REQUEST_INTERVAL_SECONDS,
    DIDReading,
    DolphinDIDLink,
)
from backend.storage.diagnostics import DiagnosticStore
from backend.transports.obdlink import OBDLinkTransport
from backend.vehicles.diagnostic_profiles import diagnostic_profile


class DIDStart(Schema):
    vehicle_profile_id: str = Field(min_length=1)
    port: str = Field(pattern=r"^COM[1-9][0-9]*$")
    save_after_first_response: bool = False
    name: str = Field(default="Vehicle observation", min_length=1, max_length=120)
    include_modules: bool = False


class DIDReplay(Schema):
    vehicle_profile_id: str = Field(min_length=1)
    recording_id: uuid.UUID
    speed: Literal[0.5, 1, 2, 5] = 1


class DIDStatus(Schema):
    state: Literal["idle", "starting", "live", "stopped", "error", "replaying", "complete"]
    source: Literal["diagnostic", "replay"]
    vehicle_profile_id: str | None
    last_error: str | None
    recording_id: str | None
    saving_armed: bool
    received: int
    latest: list[DIDReading]
    history: list[DIDReading]


class DiagnosticService:
    def __init__(self, directory, transport_factory=OBDLinkTransport):
        self.store = DiagnosticStore(directory)
        self.transport_factory = transport_factory
        self.lock = threading.RLock()
        self.halt = threading.Event()
        self.thread = None
        self.state = "idle"
        self.source = "diagnostic"
        self.vehicle_profile_id = None
        self.error = None
        self.latest = {}
        self.history = deque(maxlen=360)
        self.received = 0
        self.saving = False
        self.name = ""
        self.include_modules = False

    @property
    def busy(self):
        return bool(self.thread and self.thread.is_alive())

    def status(self):
        with self.lock:
            return DIDStatus(
                state=self.state,
                source=self.source,
                vehicle_profile_id=self.vehicle_profile_id,
                last_error=self.error,
                recording_id=self.store.recording_id,
                saving_armed=self.saving,
                received=self.received,
                latest=list(self.latest.values()),
                history=list(self.history),
            )

    def _prepare(self, source):
        if self.busy:
            raise ValueError("Stop the current diagnostic stream first")
        self.halt.clear()
        self.state = "starting"
        self.source = source
        self.error = None
        self.latest.clear()
        self.history.clear()
        self.received = 0

    def start(self, config):
        profile = diagnostic_profile(config.vehicle_profile_id)
        with self.lock:
            self._prepare("diagnostic")
            self.vehicle_profile_id = profile.id
            self.saving, self.name = config.save_after_first_response, config.name
            self.include_modules = config.include_modules
            self.thread = threading.Thread(target=self._capture, args=(config,), daemon=True)
            self.thread.start()

    def _ingest(self, reading):
        with self.lock:
            if self.source == "diagnostic" and self.saving:
                if not self.store.recording_id:
                    self.store.start(
                        self.name, diagnostic_profile(self.vehicle_profile_id).definition_version
                    )
                self.store.append(reading)
            self.latest[(reading.signal_id, reading.module_id)] = reading
            self.history.append(reading)
            self.received += 1

    def _capture(self, config):
        session = str(uuid.uuid4())
        transport = self.transport_factory(ConnectionConfig(kind="obdlink", port=config.port), session)
        try:
            transport.connect()
            link = DolphinDIDLink(transport)
            link.configure_reads()
            for request in self._requests():
                reading = link.read(request, session)
                self._ingest(reading)
                self.state = "live"
                if self.halt.wait(REQUEST_INTERVAL_SECONDS):
                    break
        except Exception as exc:
            self.error = str(exc)
            self.state = "error"
        finally:
            try:
                transport.disconnect()
            except Exception as exc:
                self.error = self.error or str(exc)
                self.state = "error"
            try:
                self.store.stop("error" if self.error else "complete")
            except Exception as exc:
                self.error = self.error or f"Recording finalization failed: {exc}"
                self.state = "error"
            finally:
                self.saving = False
            if self.state != "error":
                self.state = "stopped"

    def _requests(self):
        group = 0
        while not self.halt.is_set():
            for request in CORE_REQUESTS:
                if self.halt.is_set():
                    return
                yield request
            if self.include_modules:
                for request in MODULE_REQUESTS[group]:
                    if self.halt.is_set():
                        return
                    yield request
                group = (group + 1) % len(MODULE_REQUESTS)

    def stop(self):
        self.halt.set()
        if self.thread:
            self.thread.join(timeout=12)
            if self.thread.is_alive():
                raise TimeoutError("Diagnostic worker is still stopping")
        self.thread = None
        if self.state in {"starting", "live", "replaying"}:
            self.state = "stopped"

    def stop_saving(self):
        with self.lock:
            self.saving = False
            self.store.stop()

    def start_saving(self, name):
        with self.lock:
            if self.state not in {"live", "starting"} or self.source != "diagnostic":
                raise ValueError("Start live DID reads first")
            self.name, self.saving = name, True

    def replay(self, config):
        profile = diagnostic_profile(config.vehicle_profile_id)
        path = self.store.path_for(str(config.recording_id))
        metadata = next((row for row in self.store.sessions() if row["id"] == str(config.recording_id)), None)
        if metadata is None or metadata["definition_version"] != profile.definition_version:
            raise ValueError("Recording definition does not match the selected vehicle model")
        with self.lock:
            self._prepare("replay")
            self.vehicle_profile_id = profile.id
            self.saving = False
            self.thread = threading.Thread(target=self._replay, args=(path, config.speed), daemon=True)
            self.thread.start()

    def _replay(self, path, speed):
        self.state = "replaying"
        previous = None
        try:
            with path.open(encoding="utf-8") as file:
                while not self.halt.is_set():
                    line = file.readline(65537)
                    if not line:
                        break
                    if len(line) > 65536:
                        raise ValueError("Diagnostic replay line exceeds bound")
                    reading = DIDReading.model_validate_json(line)
                    if previous is not None and self.halt.wait(
                        max(0, reading.timestamp_monotonic - previous) / speed
                    ):
                        return
                    previous = reading.timestamp_monotonic
                    self._ingest(reading)
            self.state = "stopped" if self.halt.is_set() else "complete"
        except Exception as exc:
            self.error, self.state = str(exc), "error"

    def close(self):
        self.stop()
        self.store.close()
