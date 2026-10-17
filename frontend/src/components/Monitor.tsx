import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pause, Play, Search } from "lucide-react";
import { filterRows, idLabel, useMonitor } from "../state/store";
export function Monitor({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (key: string) => void;
}) {
  const state = useMonitor();
  const parent = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("id");
  const rows = filterRows(state.rows, search, type, sort);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 66,
    overscan: 8,
  });
  return (
    <section className="panel monitor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LIVE TRAFFIC</span>
          <h2>
            Raw CAN monitor <span className="subtle">{rows.length} IDs</span>
          </h2>
        </div>
        <button onClick={() => state.togglePause()}>
          {state.paused ? <Play size={16} /> : <Pause size={16} />}{" "}
          {state.paused ? "Resume display" : "Pause display"}
        </button>
      </div>
      <div className="filterbar">
        <div className="search">
          <Search size={14} />
          <input
            aria-label="Search CAN ID"
            placeholder="Search CAN ID, e.g. 100 / 18FF"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter frame type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All frame types</option>
          <option value="standard">11-bit standard</option>
          <option value="extended">29-bit extended</option>
        </select>
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="id">CAN ID ↑</option>
          <option value="count">Count ↓</option>
          <option value="hz">Frequency ↓</option>
        </select>
      </div>
      {state.paused && (
        <div className="pause-note">
          Display paused · Capture and recording continue
        </div>
      )}
      <div className="table-scroll">
        <div className="table-head table-grid" role="row">
          <span>CAN ID / CHANNEL</span>
          <span>TYPE</span>
          <span>DLC</span>
          <span>PAYLOAD · HEX</span>
          <span>COUNT</span>
          <span>RATE Hz</span>
          <span>LAST RECEIVED</span>
        </div>
        <div
          ref={parent}
          className="table-body"
          role="table"
          aria-label="Live CAN frames"
        >
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const f = row.frame;
              return (
                <div
                  key={row.key}
                  className={`table-grid data-row ${selected === row.key ? "selected" : ""}`}
                  role="row"
                  tabIndex={0}
                  aria-selected={selected === row.key}
                  onClick={() => onSelect(row.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(row.key);
                    }
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <span className="can-id">
                    {idLabel(row)}
                    <small>{f.channel}</small>
                  </span>
                  <span className="frame-type">
                    {f.is_extended_id ? "EXT 29" : "STD 11"}
                    {f.is_remote_frame ? " RTR" : ""}
                    <small>
                      {f.is_simulated
                        ? "SIMULATED"
                        : f.adapter_id === "replay"
                          ? "REPLAY"
                          : "PC RECEIVE"}
                    </small>
                  </span>
                  <span>{f.dlc}</span>
                  <span className="payload">
                    {f.data.match(/../g)?.map((byte, i) => (
                      <b
                        key={i}
                        className={
                          Date.now() / 1000 - row.changed_at[i] < 0.35
                            ? "changed"
                            : ""
                        }
                      >
                        {byte}
                      </b>
                    )) ?? <span className="subtle">—</span>}
                  </span>
                  <span>{row.count.toLocaleString("en-US")}</span>
                  <span className="hz">{row.hz.toFixed(1)}</span>
                  <span className="time">
                    {new Date(f.timestamp_utc).toLocaleTimeString("en-US", {
                      hour12: false,
                    })}
                    <small>{f.timestamp_source}</small>
                  </span>
                </div>
              );
            })}
          </div>
          {!rows.length && (
            <div className="empty">
              {state.status?.state === "listening"
                ? "No matching frames"
                : "Connect a source and start listening"}
            </div>
          )}
        </div>
      </div>
      <div className="panel-footer">
        Select a row to inspect raw bytes{" "}
        <span>
          {state.paused ? "DISPLAY PAUSED" : "LIVE"} ·{" "}
          {state.displayHz.toFixed(1)} display updates/s
        </span>
      </div>
    </section>
  );
}
