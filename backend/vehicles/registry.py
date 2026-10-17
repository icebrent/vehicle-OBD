import json
from pathlib import Path
from typing import Protocol

from pydantic import Field

from backend.models import CANFrame, Schema


class VehicleProfile(Schema):
    id: str
    name: str
    brand: str | None = None
    model: str | None = None
    market: str | None = None
    model_years: list[int] = Field(default_factory=list)
    notes: str = ""
    dbc_files: list[str] = Field(default_factory=list)
    known_channels: list[dict] = Field(default_factory=list)
    decoder: str | None = None
    experimental: bool = False


class Decoder(Protocol):
    def decode(self, frame: CANFrame, profile: VehicleProfile) -> dict[str, float]: ...


class RawDecoder:
    def decode(self, frame: CANFrame, profile: VehicleProfile) -> dict[str, float]:
        return {}


class ProfileRegistry:
    def __init__(self, directory: Path):
        self.profiles = {}
        for file in sorted(directory.rglob("profile.json")):
            profile = VehicleProfile.model_validate(json.loads(file.read_text(encoding="utf-8")))
            if profile.id in self.profiles:
                raise ValueError(f"Duplicate profile: {profile.id}")
            self.profiles[profile.id] = profile
