"""Synthetic transport injection for isolated tests only; never a production entry point."""

from contextlib import asynccontextmanager
from unittest.mock import patch

from backend.api.app import create_app as real_create_app
from backend.models import ConnectionConfig
from tests.mock_transport import MockTransport


def create_mock_app(data_dir=None, autostart=True):
    app = real_create_app(data_dir)
    service = app.state.capture
    service.hardware_enabled = True
    original_connect = service.connect

    async def connect(config):
        # Keep the real connection/recording lifecycle, replacing only the device driver.
        with patch(
            "backend.transports.obdlink.OBDLinkTransport",
            side_effect=lambda config, session_id: MockTransport(session_id),
        ):
            await original_connect(config)

    service.connect = connect
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(app):
        async with original_lifespan(app):
            if autostart:
                await service.connect(ConnectionConfig(kind="obdlink", port="COM999"))
                await service.start()
            yield

    app.router.lifespan_context = lifespan
    return app


# Uvicorn uses --factory; importing this module never opens a data directory.
