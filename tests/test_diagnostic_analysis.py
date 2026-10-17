from backend.analysis.diagnostics import summarize


def test_action_segments_are_descriptive_and_never_invent_missing_samples():
    def row(time, value, group=None):
        return {
            "timestamp_utc": f"2024-01-01T10:00:{time:02d}+00:00",
            "signal_id": "current",
            "module_id": group,
            "value": value,
            "unit": "A",
        }

    rows = [row(0, 2), row(2, 4), row(10, 1), row(12, -1), row(13, 3, 2)]
    report = summarize(rows, [{"label": "ac_off", "timestamp_utc": "2024-01-01T10:00:10+00:00"}])
    assert report["signals"]["current"]["count"] == 4
    assert report["signals"]["group_02/current"]["count"] == 1
    assert report["segments"][0]["signals"]["current"]["mean"] == 0
    assert report["segments"][0]["signals"]["current"]["mean_interval_seconds"] == 2
    assert summarize(rows)["segments"] == []
    assert summarize([])["signals"] == {}
