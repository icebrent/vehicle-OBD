import asyncio
import sqlite3
from uuid import UUID

from fastapi import HTTPException
from fastapi.responses import FileResponse

from backend.capture.diagnostics import DIDReplay, DIDStart, DIDStatus
from backend.models import Schema
from backend.vehicles.diagnostic_profiles import DIAGNOSTIC_PROFILES, DiagnosticProfile


class SaveName(Schema):
    name: str = "Vehicle observation"


class DiagnosticSession(Schema):
    id: str
    name: str
    started_at: str
    ended_at: str | None
    count: int
    state: str
    definition_version: str


def install_vehicle_routes(app, capture, diagnostic):
    @app.get("/api/vehicle/profiles", response_model=list[DiagnosticProfile])
    async def profiles():
        return list(DIAGNOSTIC_PROFILES.values())

    @app.get("/api/vehicle/status", response_model=DIDStatus)
    async def status():
        return diagnostic.status()

    @app.post("/api/vehicle/start", response_model=DIDStatus)
    async def start(config: DIDStart):
        async with capture.lock:
            if not capture.hardware_enabled:
                raise HTTPException(409, "Hardware access is disabled")
            if capture.state != "disconnected":
                raise HTTPException(409, "Disconnect the raw workspace first; MX+ must have one owner")
            try:
                diagnostic.start(config)
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc
        return diagnostic.status()

    @app.post("/api/vehicle/stop", response_model=DIDStatus)
    async def stop():
        async with capture.lock:
            try:
                await asyncio.to_thread(diagnostic.stop)
            except TimeoutError as exc:
                raise HTTPException(409, str(exc)) from exc
        return diagnostic.status()

    @app.post("/api/vehicle/saving/start", response_model=DIDStatus)
    async def start_saving(body: SaveName):
        try:
            diagnostic.start_saving(body.name[:120])
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return diagnostic.status()

    @app.post("/api/vehicle/saving/stop", response_model=DIDStatus)
    async def stop_saving():
        await asyncio.to_thread(diagnostic.stop_saving)
        return diagnostic.status()

    @app.get("/api/vehicle/sessions", response_model=list[DiagnosticSession])
    async def sessions():
        return await asyncio.to_thread(diagnostic.store.sessions)

    @app.get("/api/vehicle/sessions/{identity}/export")
    async def export(identity: UUID):
        try:
            path = diagnostic.store.path_for(str(identity))
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return FileResponse(path, media_type="application/x-ndjson", filename=f"{identity}.ndjson")

    @app.post("/api/vehicle/replay", response_model=DIDStatus)
    async def replay(body: DIDReplay):
        async with capture.lock:
            try:
                diagnostic.replay(body)
            except (ValueError, OSError, sqlite3.Error) as exc:
                raise HTTPException(409, str(exc)) from exc
        return diagnostic.status()
