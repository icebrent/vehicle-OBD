import { describe, it, expect } from "vitest";
import { filterRows, idLabel, monitor } from "./store";
import type { Row, Snapshot } from "../types";
const row = (id: number, extended = false, count = 1): Row => ({
  key: `can0:${id.toString(16).toUpperCase()}:${+extended}:0`,
  frame: {
    timestamp_utc: new Date().toISOString(),
    timestamp_monotonic: 1,
    session_id: "test",
    adapter_id: "mock",
    channel: "can0",
    arbitration_id: id,
    is_extended_id: extended,
    is_remote_frame: false,
    dlc: 1,
    data: "FF",
    raw_line: "SIM",
    timestamp_source: "simulation",
    is_simulated: true,
    is_fd: false,
    origin_session_id: null,
  },
  count,
  hz: count,
  changed_at: Array(8).fill(0),
});
describe("monitor data boundaries", () => {
  it("keeps extended identity and filters raw CAN IDs", () => {
    const rows = [row(0x123), row(0x123, true, 3), row(0x200)];
    expect(idLabel(rows[1])).toBe("00000123");
    expect(filterRows(rows, "0x123", "extended", "count")).toHaveLength(1);
    expect(filterRows(rows, "", "all", "count")[0].count).toBe(3);
  });
  it("bounds chart history and pauses presentation only", () => {
    const r = row(0x123);
    const message = {
      type: "snapshot",
      sequence: 1,
      status: { capture_session_id: "test", stats: { fps: 10, active_ids: 1 } },
      rows: [r],
      frames: [r.frame],
    } as Snapshot;
    for (let i = 0; i < 1000; i++) monitor.ingest(message);
    expect(monitor.points.get(r.key)?.length).toBeLessThanOrEqual(600);
    expect(monitor.overview.length).toBeLessThanOrEqual(600);
    monitor.togglePause();
    const points = monitor.points.get(r.key)?.length;
    monitor.ingest({
      ...message,
      status: {
        ...message.status,
        stats: { ...message.status.stats, received_frames: 2000 },
      },
    });
    expect(monitor.points.get(r.key)?.length).toBe(points);
    expect(monitor.status?.stats.received_frames).toBe(2000);
    monitor.togglePause();
  });
});
