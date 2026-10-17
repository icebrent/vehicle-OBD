"""Strict text parser for ATH1 / ATS0 or ATS1 / ATD1 classical CAN monitor output."""

import re
import time
from datetime import datetime, timezone

from backend.models import CANFrame


class ParseError(ValueError):
    pass


def parse_line(line: str, session_id: str, channel="can0") -> CANFrame:
    raw = line
    tokens = line.strip().upper().split()
    if not tokens:
        raise ParseError("Empty line")
    if len(tokens) == 1:
        compact = tokens[0]
        # Header + one DLC digit + byte pairs: standard length is even,
        # extended length is odd, including low-valued 29-bit identifiers.
        header_length = 3 if len(compact) % 2 == 0 else 8
        if not re.fullmatch(r"[0-9A-F]+", compact) or len(compact) < header_length + 1:
            raise ParseError("Invalid compact CAN line")
        tokens = [compact[:header_length], compact[header_length]] + [
            compact[i : i + 2] for i in range(header_length + 1, len(compact), 2)
        ]
    if re.fullmatch(r"[0-9A-F]{3}|[0-9A-F]{8}", tokens[0]):
        header = tokens.pop(0)
    elif len(tokens) >= 5 and all(re.fullmatch(r"[0-9A-F]{2}", x) for x in tokens[:4]):
        header = "".join(tokens[:4])
        tokens = tokens[4:]
    else:
        raise ParseError("Expected a 3-digit standard or 8-digit extended header")
    if not tokens or not re.fullmatch(r"[0-8]", tokens[0]):
        raise ParseError("Missing or invalid classical CAN DLC")
    dlc = int(tokens.pop(0), 16)
    remote = tokens == ["RTR"]
    if not remote and (len(tokens) != dlc or any(not re.fullmatch(r"[0-9A-F]{2}", t) for t in tokens)):
        raise ParseError("Invalid payload or DLC mismatch")
    try:
        return CANFrame(
            timestamp_utc=datetime.now(timezone.utc),
            timestamp_monotonic=time.monotonic(),
            session_id=session_id,
            adapter_id="obdlink-mxplus",
            channel=channel,
            arbitration_id=int(header, 16),
            is_extended_id=len(header) == 8,
            is_remote_frame=remote,
            dlc=dlc,
            data=b"" if remote else bytes.fromhex(" ".join(tokens)),
            raw_line=raw,
            timestamp_source="pc_receive",
        )
    except ValueError as exc:
        raise ParseError(str(exc)) from exc
