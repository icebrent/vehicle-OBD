from pathlib import Path
from typing import Protocol


class Exporter(Protocol):
    media_type: str
    extension: str

    def prepare(self, source: Path) -> Path: ...


class NDJSONExporter:
    media_type = "application/x-ndjson"
    extension = "ndjson"

    def prepare(self, source: Path) -> Path:
        return source


EXPORTERS: dict[str, Exporter] = {"ndjson": NDJSONExporter()}
