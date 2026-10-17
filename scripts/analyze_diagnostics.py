"""Usage: python -m scripts.analyze_diagnostics RECORDING_UUID [--output report.json]."""

import argparse
import json
from pathlib import Path
from uuid import UUID

from backend.analysis.diagnostics import summarize


def main():
    parser = argparse.ArgumentParser(description="Summarize recorded DID values and operator markers offline")
    parser.add_argument("recording_id", type=UUID)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "data" / "diagnostics"
    source = root / f"{args.recording_id}.ndjson"
    events = root / f"{args.recording_id}.events.ndjson"
    rows = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
    markers = (
        [json.loads(line) for line in events.read_text(encoding="utf-8").splitlines() if line.strip()]
        if events.exists()
        else []
    )
    report = json.dumps(summarize(rows, markers), ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(report + "\n", encoding="utf-8")
    else:
        print(report)


if __name__ == "__main__":
    main()
