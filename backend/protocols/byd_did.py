"""Fixed experimental battery DID definitions; single-frame responses only."""

import re
import time
from datetime import datetime, timezone
from typing import Literal

from pydantic import model_validator

from backend.models import Schema
from backend.protocols.pid_probe import SETUP, StandardPIDProbe

DEFINITIONS = {
    "220005": ("soc", "%", 1),
    "220008": ("voltage", "V", 2),
    "220009": ("current", "A", 2),
    "220032": ("temperature", "°C", 1),
}
CORE_REQUESTS = tuple(DEFINITIONS)
# Only the 10 explicitly defined candidate blocks; no range scanning.
MODULE_REQUESTS = []
for index in range(10):
    block = []
    for offset, signal, unit, size in (
        (0, "module_min_voltage", "V", 2),
        (2, "module_max_voltage", "V", 2),
        (4, "module_temperature_a", "°C", 1),
        (6, "module_temperature_b", "°C", 1),
    ):
        request = f"22{0x16D + index * 8 + offset:04X}"
        DEFINITIONS[request] = (signal, unit, size)
        block.append(request)
    MODULE_REQUESTS.append(tuple(block))
MODULE_IDS = {request: index + 1 for index, block in enumerate(MODULE_REQUESTS) for request in block}
CONFIGURE = tuple("ATSH 7E7" if c == "ATSH 7DF" else c for c in SETUP)
REQUEST_INTERVAL_SECONDS = 0.5
CONFIGURE = tuple("STPTRQ 500" if c == "STPTRQ 2000" else c for c in CONFIGURE)
# A single addressed ECU, single-frame response: stop waiting after one reply.
READ_COMMANDS = frozenset(f"{request} 1" for request in DEFINITIONS)


class DIDReading(Schema):
    schema_version: Literal[1] = 1
    source: Literal["diagnostic"] = "diagnostic"
    timestamp_utc: datetime
    timestamp_monotonic: float
    timestamp_source: Literal["pc_receive"] = "pc_receive"
    session_id: str
    request_id: Literal["7E7"] = "7E7"
    response_id: Literal["7EF"] = "7EF"
    request: str
    raw_response: str
    data_hex: str
    signal_id: Literal[
        "soc",
        "voltage",
        "current",
        "temperature",
        "module_min_voltage",
        "module_max_voltage",
        "module_temperature_a",
        "module_temperature_b",
    ]
    module_id: int | None = None
    value: float
    unit: str
    definition_version: Literal["dolphin-community-v1"] = "dolphin-community-v1"
    validation: Literal["experimental"] = "experimental"

    @model_validator(mode="after")
    def validate_definition(self):
        definition = DEFINITIONS.get(self.request)
        if not definition or (self.signal_id, self.unit) != definition[:2]:
            raise ValueError("Reading does not match the fixed DID definition")
        if self.module_id != MODULE_IDS.get(self.request):
            raise ValueError("DID module identity mismatch")
        return self


def decode_response(response, request, session_id):
    if request not in DEFINITIONS:
        raise ValueError("DID is not on the validated request whitelist")
    readings = []
    for line in response.replace(">", "").replace("\n", "\r").split("\r"):
        text = line.strip().replace(" ", "").upper()
        if not text or text in {request, request + "1"}:
            continue
        if not re.fullmatch(r"7EF(?:[0-9A-F]{2}){2,8}", text):
            raise ValueError(f"Unexpected DID response: {text[:80]}")
        frame = bytes.fromhex(text[3:])
        length = frame[0]
        if not 1 <= length <= 7 or len(frame) < length + 1:
            raise ValueError("Only complete ISO-TP single frames are accepted")
        payload = frame[1 : length + 1]
        if payload[:3] != b"\x62" + bytes.fromhex(request[2:]):
            raise ValueError(f"DID rejected or mismatched: {payload.hex().upper()}")
        signal, unit, size = DEFINITIONS[request]
        data = payload[3:]
        if len(data) != size:
            raise ValueError("DID response length mismatch")
        raw = int.from_bytes(data, "little")
        if signal == "current":
            value = (raw - 5000) / 10
        elif signal == "temperature" or signal.startswith("module_temperature"):
            value = raw - 40
        elif signal in {"module_min_voltage", "module_max_voltage"}:
            value = raw / 1000
        else:
            value = raw
        if signal == "soc" and not 0 <= value <= 100:
            raise ValueError("Invalid SOC value")
        readings.append(
            DIDReading(
                timestamp_utc=datetime.now(timezone.utc),
                timestamp_monotonic=time.monotonic(),
                session_id=session_id,
                request=request,
                raw_response=response,
                data_hex=data.hex().upper(),
                signal_id=signal,
                module_id=MODULE_IDS.get(request),
                value=value,
                unit=unit,
            )
        )
    if len(readings) != 1:
        raise ValueError("Expected exactly one matching ECU response")
    return readings[0]


class DolphinDIDLink(StandardPIDProbe):
    allowed_commands = frozenset(CONFIGURE) | READ_COMMANDS

    def configure_reads(self):
        for command in CONFIGURE:
            self.configure(command)

    def read(self, request, session_id):
        if request not in DEFINITIONS:
            raise ValueError("DID is not on the validated request whitelist")
        return decode_response(self.exchange(f"{request} 1"), request, session_id)
