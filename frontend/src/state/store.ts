import { useSyncExternalStore } from "react";
import type { Point, Snapshot, Status, Row } from "../types";
export function idLabel(row: Row) {
  return row.frame.arbitration_id
    .toString(16)
    .toUpperCase()
    .padStart(row.frame.is_extended_id ? 8 : 3, "0");
}
export function filterRows(
  rows: Row[],
  query: string,
  extended: string,
  sort: string,
) {
  return rows
    .filter(
      (r) =>
        idLabel(r).includes(query.trim().replace(/^0x/i, "").toUpperCase()) &&
        (extended === "all" ||
          r.frame.is_extended_id === (extended === "extended")),
    )
    .sort((a, b) =>
      sort === "count"
        ? b.count - a.count
        : sort === "hz"
          ? b.hz - a.hz
          : a.frame.arbitration_id - b.frame.arbitration_id,
    );
}
class MonitorStore {
  listeners = new Set<() => void>();
  status: Status | null = null;
  rows: Row[] = [];
  points = new Map<string, Point[]>();
  overview: [number, number, number][] = [];
  paused = false;
  connected = false;
  version = 0;
  displayHz = 0;
  private lastDisplay = 0;
  private socket: WebSocket | null = null;
  private timer = 0;
  private disposed = false;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;
  notify() {
    this.version++;
    this.listeners.forEach((f) => f());
  }
  start() {
    this.disposed = false;
    this.open();
    return () => {
      this.disposed = true;
      clearTimeout(this.timer);
      this.socket?.close();
    };
  }
  open() {
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    this.socket = ws;
    ws.onopen = () => {
      this.connected = true;
      this.notify();
    };
    ws.onmessage = (e) => this.ingest(JSON.parse(e.data) as Snapshot);
    ws.onclose = () => {
      this.connected = false;
      this.notify();
      if (!this.disposed)
        this.timer = window.setTimeout(() => this.open(), 1500);
    };
  }
  ingest(message: Snapshot) {
    const newCapture =
      this.status?.capture_session_id !== message.status.capture_session_id;
    this.status = message.status;
    if (newCapture) {
      this.points.clear();
      this.overview = [];
      this.rows = [];
    }
    if (!this.paused) {
      const now = Date.now();
      this.displayHz = this.lastDisplay ? 1000 / (now - this.lastDisplay) : 0;
      this.lastDisplay = now;
      this.rows = message.rows;
      this.overview.push([
        now,
        message.status.stats.fps,
        message.status.stats.active_ids,
      ]);
      this.overview = this.overview
        .filter((p) => now - p[0] < 60000)
        .slice(-600);
      // One latest raw sample per ID per WS batch; recordings always retain every admitted frame.
      const latest = new Map(
        message.frames.map((f) => [
          `${f.channel}:${f.arbitration_id.toString(16).toUpperCase()}:${+f.is_extended_id}:${+f.is_remote_frame}`,
          f,
        ]),
      );
      for (const [key, frame] of latest) {
        const bytes =
          frame.data.match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
        const list = this.points.get(key) ?? [];
        list.push({
          t: now,
          bytes: Array.from({ length: 8 }, (_, i) => bytes[i] ?? null),
        });
        this.points.set(key, list.filter((p) => now - p.t < 60000).slice(-600));
      }
      const keys = new Set(message.rows.map((r) => r.key));
      for (const key of this.points.keys())
        if (!keys.has(key)) this.points.delete(key);
    }
    this.notify();
  }
  togglePause() {
    this.paused = !this.paused;
    this.notify();
  }
}
export const monitor = new MonitorStore();
export function useMonitor() {
  useSyncExternalStore(monitor.subscribe, monitor.snapshot);
  return monitor;
}
