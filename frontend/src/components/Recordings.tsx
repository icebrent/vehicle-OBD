import { useCallback, useEffect, useState } from "react";
import { Circle, Download, History, Play, Square } from "lucide-react";
import { RefreshButton } from "./RefreshButton";
import { api } from "../api";
import { useMonitor } from "../state/store";
import type { Diagnostic, Session } from "../types";
export function Recordings({ onError }: { onError: (text: string) => void }) {
  const { status } = useMonitor();
  const [name, setName] = useState("CAN capture");
  const [notes, setNotes] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<Diagnostic[]>([]);
  const [tab, setTab] = useState("sessions");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    api<Session[]>("/sessions")
      .then(setSessions)
      .catch((e) => onError(e.message));
    api<Diagnostic[]>("/diagnostics")
      .then(setLogs)
      .catch((e) => onError(e.message));
  }, [onError]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  const run = async (path: string, body: unknown = {}) => {
    setBusy(true);
    try {
      await api(path, body);
      refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const replay = async (id: string) => {
    setBusy(true);
    try {
      await api("/disconnect", {});
      await api("/connect", { kind: "replay", replay_session_id: id });
      await api("/capture/start", {});
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel recordings">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CAPTURE WORKSPACE</span>
          <h2>Recording & history</h2>
        </div>
        <span className="tag">NDJSON + SQLite</span>
      </div>
      <div className="record-form">
        <input
          aria-label="Recording name"
          placeholder="Recording name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!status?.recording_id}
        />
        <input
          aria-label="Recording notes"
          placeholder="Add notes (optional)"
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!!status?.recording_id}
        />
        {status?.recording_id ? (
          <button
            className="recording-button"
            disabled={busy}
            onClick={() => run("/recording/stop")}
          >
            <Square size={16} />
            Stop saving
          </button>
        ) : (
          <button
            disabled={busy || status?.state !== "listening" || !name.trim()}
            onClick={() => run("/recording/start", { name, notes })}
          >
            <Circle size={16} />
            Start saving
          </button>
        )}
      </div>
      <div className="tabs">
        <button
          className={tab === "sessions" ? "active" : ""}
          onClick={() => setTab("sessions")}
        >
          <History size={13} />
          Recording history <span>{sessions.length}</span>
        </button>
        <button
          className={tab === "logs" ? "active" : ""}
          onClick={() => setTab("logs")}
        >
          Adapter diagnostics
        </button>
        <RefreshButton
          className="refresh-history"
          label="Refresh history"
          onClick={refresh}
        />
      </div>
      <div className="history-list">
        {tab === "sessions" ? (
          sessions.length ? (
            sessions.map((s) => (
              <div className="session-row" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {new Date(s.started_at).toLocaleString("en-US")} ·{" "}
                    {s.source.toUpperCase()} ·{" "}
                    {s.frame_count.toLocaleString("en-US")} frames · {s.status}
                  </small>
                  {s.notes && <small>{s.notes}</small>}
                </div>
                <div className="inline">
                  <button
                    aria-label={`Replay ${s.name}`}
                    disabled={busy || s.status === "recording"}
                    onClick={() => replay(s.id)}
                  >
                    <Play size={16} />
                    Replay
                  </button>
                  {s.status !== "recording" && (
                    <a className="button" href={`/api/sessions/${s.id}/export`}>
                      <Download size={16} />
                      Export NDJSON
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No recordings yet</div>
          )
        ) : (
          logs
            .slice()
            .reverse()
            .map((l, i) => (
              <div className={`log ${l.level}`} key={i}>
                <time>
                  {new Date(l.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                  })}
                </time>
                <span>{l.message}</span>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
