from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class CANFrame(Schema):
    timestamp_utc: datetime
    timestamp_monotonic: float = Field(ge=0)
    session_id: str
    adapter_id: str
    channel: str = "can0"
    arbitration_id: int = Field(ge=0, le=0x1FFFFFFF)
    is_extended_id: bool = False
    is_remote_frame: bool = False
    dlc: int = Field(ge=0, le=8)
    data: bytes
    raw_line: str
    timestamp_source: Literal["pc_receive", "simulation", "device"]
    is_simulated: bool = False
    is_fd: Literal[False] = False  # Reserved extension; this release supports classical CAN only.
    origin_session_id: str | None = None

    @field_validator("data", mode="before")
    @classmethod
    def parse_hex(cls, value):
        if isinstance(value, str):
            return bytes.fromhex(value)
        return value

    @field_serializer("data")
    def hex_data(self, value: bytes):
        return value.hex().upper()

    @model_validator(mode="after")
    def validate_frame(self):
        if not self.is_extended_id and self.arbitration_id > 0x7FF:
            raise ValueError("Standard ID exceeds 11 bits")
        if len(self.data) != (0 if self.is_remote_frame else self.dlc):
            raise ValueError("DLC and payload length disagree")
        if self.timestamp_utc.tzinfo is None:
            raise ValueError("UTC timestamp must be timezone aware")
        self.timestamp_utc = self.timestamp_utc.astimezone(timezone.utc)
        return self


class ConnectionConfig(Schema):
    kind: Literal["obdlink", "replay"] = "obdlink"
    port: str | None = Field(default=None, pattern=r"^COM[1-9][0-9]*$")
    monitor_strategy: Literal["sampled_16"] = "sampled_16"
    monitor_interval_seconds: float = Field(default=1.0, ge=0.1, le=10)
    serial_baudrate: Literal[9600, 38400, 57600, 115200, 230400] = 115200
    can_bitrate: Literal[125000, 250000, 500000, 1000000] = 500000
    channel: Literal["can0"] = "can0"
    replay_session_id: str | None = None
    replay_speed: float = Field(default=1, ge=0.1, le=10)


class RecordingRequest(Schema):
    name: str = Field(min_length=1, max_length=120)
    notes: str = Field(default="", max_length=2000)


class Diagnostic(Schema):
    timestamp: datetime
    level: str
    message: str


class Stats(Schema):
    received_frames: int = 0
    parsed_frames: int = 0
    received_bytes: int = 0
    parse_errors: int = 0
    buffer_overflows: int = 0
    queue_drops: int = 0
    ws_drops: int = 0
    analysis_evictions: int = 0
    storage_errors: int = 0
    fps: float = 0
    active_ids: int = 0


class MonitorRow(Schema):
    key: str
    frame: CANFrame
    count: int
    hz: float
    changed_at: list[float]


class Status(Schema):
    state: Literal["disconnected", "connected", "listening", "querying", "error"]
    config: ConnectionConfig
    capture_session_id: str | None
    recording_id: str | None
    session_name: str
    profile_id: str
    hardware_enabled: bool
    last_error: str | None
    stats: Stats


class Snapshot(Schema):
    type: Literal["snapshot"] = "snapshot"
    sequence: int
    status: Status
    rows: list[MonitorRow]
    frames: list[CANFrame]


class PortInfo(Schema):
    device: str
    description: str
    hwid: str


class SessionRecord(Schema):
    id: str
    name: str
    notes: str
    started_at: str
    ended_at: str | None
    source: str
    profile_id: str
    frame_count: int
    status: str
    config: str
    quality: str


class RecordingStarted(Schema):
    recording_id: str
