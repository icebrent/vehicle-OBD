import time
from datetime import datetime, timezone

import pytest

from backend.models import CANFrame


@pytest.fixture
def frame():
    return CANFrame(
        timestamp_utc=datetime.now(timezone.utc),
        timestamp_monotonic=time.monotonic(),
        session_id="capture-original",
        adapter_id="mock",
        arbitration_id=0x100,
        dlc=2,
        data=b"\x00\xff",
        raw_line="SIM 100 2 00 FF",
        timestamp_source="simulation",
        is_simulated=True,
    )


def wait_until(predicate, timeout=3):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("Timed out waiting for condition")
