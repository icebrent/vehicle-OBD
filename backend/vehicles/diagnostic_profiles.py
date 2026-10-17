"""Explicit Vehicle-workspace decoder catalog, independent from raw CAN profiles."""

from backend.models import Schema


class DiagnosticProfile(Schema):
    id: str
    name: str
    definition_version: str
    request_id: str
    response_id: str
    experimental: bool = True


DIAGNOSTIC_PROFILES = {
    "byd-dolphin-jp": DiagnosticProfile(
        id="byd-dolphin-jp",
        name="BYD Dolphin / Japan",
        definition_version="dolphin-community-v1",
        request_id="7E7",
        response_id="7EF",
    )
}


def diagnostic_profile(identity: str) -> DiagnosticProfile:
    profile = DIAGNOSTIC_PROFILES.get(identity)
    if profile is None:
        raise ValueError("Select a supported vehicle model before starting")
    return profile
