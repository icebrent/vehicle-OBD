import time
from collections import OrderedDict, deque

from backend.models import CANFrame, MonitorRow


def frame_key(f: CANFrame) -> str:
    return f"{f.channel}:{f.arbitration_id:X}:{int(f.is_extended_id)}:{int(f.is_remote_frame)}"


class Aggregator:
    def __init__(self, max_ids=4096):
        self.rows = OrderedDict()
        self.max_ids = max_ids
        self.evictions = 0

    def add(self, frame: CANFrame, arrival: float | None = None):
        now = arrival if arrival is not None else time.monotonic()
        key = frame_key(frame)
        previous = self.rows.get(key)
        changes = previous[2] if previous else [0.0] * 8
        if previous:
            for i, byte in enumerate(frame.data):
                if i >= len(previous[0].data) or byte != previous[0].data[i]:
                    changes[i] = time.time()
        times = previous[3] if previous else deque(maxlen=512)
        times.append(now)
        self.rows[key] = (frame, previous[1] + 1 if previous else 1, changes, times)
        self.rows.move_to_end(key)
        if len(self.rows) > self.max_ids:
            self.rows.popitem(last=False)
            self.evictions += 1

    def snapshot(self, now: float):
        output = []
        for key, (frame, count, changes, times) in self.rows.items():
            recent = [t for t in times if now - t <= 2]
            span = recent[-1] - recent[0] if len(recent) > 1 else 0
            hz = (len(recent) - 1) / span if span > 0 else 0
            output.append(
                MonitorRow(key=key, frame=frame, count=count, hz=round(hz, 1), changed_at=changes.copy())
            )
        return output

    def active_count(self, now):
        return sum(now - row[3][-1] < 2 for row in self.rows.values())
