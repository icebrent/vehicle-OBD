import pytest
from pydantic import ValidationError

from backend.models import CANFrame
from backend.protocols.obdlink import ParseError, parse_line


@pytest.mark.parametrize(
    "line,can_id,extended,dlc,data",
    [
        ("1230", 0x123, False, 0, b""),
        ("123200FF", 0x123, False, 2, b"\x00\xff"),
        ("000001231FF", 0x123, True, 1, b"\xff"),
        ("1FFFFFFF80011223344556677", 0x1FFFFFFF, True, 8, bytes.fromhex("0011223344556677")),
        ("123 0", 0x123, False, 0, b""),
        ("7FF 1 a5", 0x7FF, False, 1, b"\xa5"),
        ("18FF5010 4 00 10 FF 23", 0x18FF5010, True, 4, b"\x00\x10\xff\x23"),
        ("18 FF 50 10 2 AA BB", 0x18FF5010, True, 2, b"\xaa\xbb"),
        ("00000123 1 FF", 0x123, True, 1, b"\xff"),
        ("1FFFFFFF 8 00 11 22 33 44 55 66 77", 0x1FFFFFFF, True, 8, bytes.fromhex("0011223344556677")),
    ],
)
def test_parse(line, can_id, extended, dlc, data):
    f = parse_line(line, "test")
    assert (f.arbitration_id, f.is_extended_id, f.dlc, f.data) == (can_id, extended, dlc, data)
    assert f.timestamp_source == "pc_receive"
    assert f.raw_line == line
    assert CANFrame.model_validate_json(f.model_dump_json()).data == data


@pytest.mark.parametrize(
    "line",
    [
        "",
        "OK",
        ">",
        "BUFFER FULL",
        "123",
        "800 0",
        "FFFFFFFF 0",
        "123900",
        "8000",
        "FFFFFFFF0",
        "1232FF",
        "1231XY",
        "12300A",
        "123 9 00",
        "123 2 FF",
        "123 0 AA",
        "123 1 XY",
        "123 1 F",
        "123 -1",
        "123 1 AA <DATA ERROR",
        "0012 0",
        "123 1 AA\x00",
        "18 FF 50 10 8 AA",
    ],
)
def test_invalid(line):
    with pytest.raises(ParseError):
        parse_line(line, "test")


def test_remote():
    f = parse_line("123 8 RTR", "test")
    assert f.is_remote_frame and f.dlc == 8 and f.data == b""


def test_model_guards(frame):
    body = frame.model_dump()
    for change in (
        {"arbitration_id": 0x800},
        {"dlc": 8},
        {"is_fd": True},
        {"timestamp_monotonic": float("nan")},
        {"timestamp_utc": "2026-01-01T00:00:00"},
    ):
        with pytest.raises(ValidationError):
            CANFrame.model_validate(body | change)
