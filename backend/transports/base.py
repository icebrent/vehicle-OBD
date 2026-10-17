from abc import ABC, abstractmethod
from typing import Callable

from backend.models import CANFrame

FrameSink = Callable[[CANFrame], None]
EventSink = Callable[[str, str], None]


class Transport(ABC):
    """Adapter-local control only. Deliberately no send-frame operation."""

    @abstractmethod
    def connect(self) -> None: ...

    @abstractmethod
    def start(self, emit: FrameSink, event: EventSink) -> None: ...

    @abstractmethod
    def stop(self) -> None: ...

    @abstractmethod
    def disconnect(self) -> None: ...
