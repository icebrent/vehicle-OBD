"""Descriptive summaries only; operator annotations are not ECU gear/A/C signals."""

from collections import defaultdict
from datetime import datetime
from statistics import mean, median


def summarize(readings, markers=()):
    rows = sorted(readings, key=lambda row: datetime.fromisoformat(row["timestamp_utc"]))
    events = sorted(markers, key=lambda row: datetime.fromisoformat(row["timestamp_utc"]))

    def stats(items):
        grouped = defaultdict(list)
        for row in items:
            key = row["signal_id"]
            if row.get("module_id") is not None:
                key = f"group_{row['module_id']:02d}/{key}"
            grouped[key].append(row)
        result = {}
        for key, samples in grouped.items():
            values = [row["value"] for row in samples]
            times = [datetime.fromisoformat(row["timestamp_utc"]).timestamp() for row in samples]
            result[key] = {
                "count": len(values),
                "unit": samples[0]["unit"],
                "min": min(values),
                "max": max(values),
                "mean": mean(values),
                "median": median(values),
                "first": values[0],
                "last": values[-1],
                "change": values[-1] - values[0],
                "mean_interval_seconds": mean(b - a for a, b in zip(times, times[1:]))
                if len(times) > 1
                else None,
            }
        return result

    segments = []
    for index, event in enumerate(events):
        start = datetime.fromisoformat(event["timestamp_utc"])
        end = datetime.fromisoformat(events[index + 1]["timestamp_utc"]) if index + 1 < len(events) else None
        selected = [
            row
            for row in rows
            if datetime.fromisoformat(row["timestamp_utc"]) >= start
            and (end is None or datetime.fromisoformat(row["timestamp_utc"]) < end)
        ]
        segments.append(
            {
                "operator_annotation": event["label"],
                "start": start.isoformat(),
                "end": end.isoformat() if end else None,
                "signals": stats(selected),
            }
        )
    return {
        "readings": len(rows),
        "signals": stats(rows),
        "segments": segments,
        "limitations": [
            "Descriptive statistics do not establish causation.",
            "Forward/reverse and A/C labels are operator notes, not measured vehicle state.",
            "Sequential sampling may miss short events; group positions and conversions are experimental.",
            "Sparse segments and missing markers cannot establish action-specific effects.",
        ],
    }
