import asyncio
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.capture.service import CaptureService
from backend.models import (
    ConnectionConfig,
    Diagnostic,
    MockScenario,
    PortInfo,
    ProfileSelection,
    RecordingRequest,
    RecordingStarted,
    SessionRecord,
    Status,
)
from backend.protocols.pid_probe import PIDReport, StandardPIDProbe
from backend.storage.exporters import EXPORTERS


def create_app(data_dir=None, autostart=None):
    from backend.storage.sessions import SessionStore
    from backend.vehicles.registry import ProfileRegistry

    root = Path(__file__).resolve().parents[2]
    store = SessionStore(Path(data_dir or os.getenv("CAN_DATA_DIR", root / "data")))
    profiles = ProfileRegistry(root / "vehicles")
    service = CaptureService(store, profiles)
    from backend.api.vehicle import install_vehicle_routes
    from backend.capture.diagnostics import DiagnosticService

    diagnostic = DiagnosticService(store.directory)
    last_pid_report = None
    allowed_origins = {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    }
    if os.getenv("CAN_ALLOWED_ORIGIN"):
        allowed_origins.add(os.environ["CAN_ALLOWED_ORIGIN"])

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(service.run())
        if autostart if autostart is not None else os.getenv("CAN_AUTOSTART_MOCK", "1") == "1":
            async with service.lock:
                await service.connect(ConnectionConfig())
                await service.start()
        yield
        try:
            await asyncio.to_thread(diagnostic.close)
            await service.close()
        finally:
            service.running = False
            await task
            store.close()

    app = FastAPI(title="CAN Observatory", version="0.1.0", lifespan=lifespan)
    app.state.capture = service
    app.state.diagnostic = diagnostic
    install_vehicle_routes(app, service, diagnostic)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        # Prevent hostile websites from issuing localhost mutations. No permissive CORS.
        origin = request.headers.get("origin")
        if origin and origin not in allowed_origins:
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "Untrusted origin"}, status_code=403)
        return await call_next(request)

    async def action(callback, *args):
        async with service.lock:
            if diagnostic.busy:
                raise HTTPException(409, "Stop vehicle DID reads/replay before changing raw capture")
            try:
                await callback(*args)
            except (ValueError, RuntimeError, OSError, TimeoutError) as exc:
                service.last_error = str(exc)
                service.log("error", str(exc))
                raise HTTPException(409, str(exc)) from exc
        return service.status()

    @app.get("/api/status", response_model=Status)
    async def status():
        async with service.lock:
            return service.status()

    @app.post("/api/connect", response_model=Status)
    async def connect(config: ConnectionConfig):
        return await action(service.connect, config)

    @app.post("/api/disconnect", response_model=Status)
    async def disconnect():
        return await action(service.disconnect)

    @app.post("/api/capture/start", response_model=Status)
    async def start():
        return await action(service.start)

    @app.post("/api/capture/stop", response_model=Status)
    async def stop():
        return await action(service.stop)

    @app.get("/api/ports", response_model=list[PortInfo])
    async def ports():
        from serial.tools.list_ports import comports

        entries = await asyncio.to_thread(comports)
        return [{"device": p.device, "description": p.description, "hwid": p.hwid} for p in entries]

    @app.get("/api/obd/report", response_model=PIDReport | None)
    async def pid_report():
        return last_pid_report

    @app.post("/api/obd/probe", response_model=PIDReport)
    async def probe_pids():
        nonlocal last_pid_report
        async with service.lock:
            if (
                not service.hardware_enabled
                or service.config.kind != "obdlink"
                or service.state != "connected"
                or store.recording_id
            ):
                raise HTTPException(409, "Connect MX+ and stop capture/saving before explicit PID reads")
            service.state = "querying"
            last_pid_report = None
            service.log("info", "Operator requested finite Mode 01 PID probe; active read requests")
            try:
                last_pid_report = await asyncio.to_thread(StandardPIDProbe(service.transport).run)
                service.last_error = None
                return last_pid_report
            except (ValueError, RuntimeError, OSError, TimeoutError) as exc:
                service.last_error = str(exc)
                service.log("error", str(exc))
                raise HTTPException(409, str(exc)) from exc
            finally:
                service.state = "connected" if service.transport.connected else "error"

    @app.get("/api/diagnostics", response_model=list[Diagnostic])
    async def diagnostics():
        return list(service.logs)

    from backend.vehicles.registry import VehicleProfile

    @app.get("/api/profiles", response_model=list[VehicleProfile])
    async def profile_list():
        return list(profiles.profiles.values())

    @app.post("/api/profiles/select", response_model=ProfileSelection)
    async def select_profile(selection: ProfileSelection):
        if selection.profile_id not in profiles.profiles:
            raise HTTPException(404, "Profile not found")
        service.profile_id = selection.profile_id
        service.log("info", f"Profile selected (decoder only): {selection.profile_id}")
        return {"profile_id": service.profile_id}

    @app.post("/api/mock/scenario", response_model=MockScenario)
    async def scenario(body: MockScenario):
        if service.config.kind != "mock" or service.transport is None:
            raise HTTPException(409, "Mock source required")
        service.transport.button = body.button
        return body

    @app.post("/api/recording/start", response_model=RecordingStarted)
    async def record(body: RecordingRequest):
        async with service.lock:
            if service.state != "listening" or store.recording_id:
                raise HTTPException(409, "Start listening first, or stop the current recording")
            # Recording boundary: process all older ingress before opening the file.
            await service.drain_boundary()
            try:
                return await asyncio.to_thread(store.start, body, service.status())
            except (OSError, sqlite3.Error) as exc:
                service.stats.storage_errors += 1
                service.last_error = f"Unable to create recording: {exc}"
                service.log("error", service.last_error)
                raise HTTPException(507, service.last_error) from exc

    @app.post("/api/recording/stop", response_model=Status)
    async def record_stop():
        async with service.lock:
            await service.drain_boundary()
            await asyncio.to_thread(store.stop, "complete", service.stats)
        return service.status()

    @app.get("/api/sessions", response_model=list[SessionRecord])
    async def sessions():
        return await asyncio.to_thread(store.list_sessions)

    @app.get("/api/sessions/{session_id}/export")
    async def export(session_id: str, format: Literal["ndjson"] = "ndjson"):
        if store.recording_id == session_id:
            raise HTTPException(409, "Stop recording before exporting")
        try:
            path = await asyncio.to_thread(store.path_for, session_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        exporter = EXPORTERS[format]
        return FileResponse(
            exporter.prepare(path),
            media_type=exporter.media_type,
            filename=f"{session_id}.{exporter.extension}",
        )

    @app.websocket("/ws")
    async def websocket(ws: WebSocket):
        if ws.headers.get("origin") is not None and ws.headers.get("origin") not in allowed_origins:
            await ws.close(code=1008)
            return
        await ws.accept()
        subscriber = asyncio.Queue(maxsize=2)
        service.subscribers.add(subscriber)

        async def send():
            await ws.send_text(service.snapshot().model_dump_json())
            while True:
                await asyncio.wait_for(ws.send_text(await subscriber.get()), timeout=5)

        async def receive():
            while True:
                await ws.receive_text()  # No client command protocol.

        sender = asyncio.create_task(send())
        receiver = asyncio.create_task(receive())
        try:
            done, _ = await asyncio.wait([sender, receiver], return_when=asyncio.FIRST_COMPLETED)
            for completed in done:
                completed.result()
        except (WebSocketDisconnect, RuntimeError, TimeoutError):
            pass
        finally:
            service.subscribers.discard(subscriber)
            sender.cancel()
            receiver.cancel()
            await asyncio.gather(sender, receiver, return_exceptions=True)

    return app
