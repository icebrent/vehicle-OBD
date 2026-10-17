import math
import random
import threading
import time
from datetime import datetime, timezone

from backend.models import CANFrame
from backend.transports.base import Transport


class MockTransport(Transport):
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.connected = False
        self.button = False
        self.halt = threading.Event()
        self.thread = None

    def connect(self):
        if self.connected:
            raise RuntimeError("Transport already connected")
        self.connected = True

    def start(self, emit, event):
        if not self.connected or (self.thread and self.thread.is_alive()):
            raise RuntimeError("Invalid start state")
        self.halt.clear()
        self.thread = threading.Thread(target=self._run, args=(emit,), daemon=True)
        self.thread.start()
        event("info", "Mock simulation started")

    def _run(self, emit):
        rng = random.Random(42)
        specs = [
            (0x100, False, 8, 0.02),
            (0x210, False, 4, 0.05),
            (0x18FF5010, True, 8, 0.1),
            (0x321, False, 1, 0.2),
            (0x7A0, False, 0, 0.5),
        ]
        due = [time.monotonic()] * len(specs)
        counters = [0] * len(specs)
        while not self.halt.wait(0.002):
            now = time.monotonic()
            for i, (can_id, extended, dlc, period) in enumerate(specs):
                if now < due[i]:
                    continue
                due[i] += period
                if now - due[i] > period * 4:
                    due[i] = now + period
                counters[i] += 1
                payload = bytes(
                    [
                        int((math.sin(now) + 1) * 127),
                        counters[i] % 256,
                        int(self.button),
                        rng.randrange(256),
                        0xAA,
                        0x55,
                        0,
                        0,
                    ][:dlc]
                )
                emit(
                    CANFrame(
                        timestamp_utc=datetime.now(timezone.utc),
                        timestamp_monotonic=now,
                        session_id=self.session_id,
                        adapter_id="mock",
                        arbitration_id=can_id,
                        is_extended_id=extended,
                        dlc=dlc,
                        data=payload,
                        raw_line=f"SIM {can_id:X} {dlc} {payload.hex()}",
                        timestamp_source="simulation",
                        is_simulated=True,
                    )
                )

    def stop(self):
        self.halt.set()
        if self.thread:
            self.thread.join(timeout=3)

    def disconnect(self):
        self.stop()
        self.connected = False
