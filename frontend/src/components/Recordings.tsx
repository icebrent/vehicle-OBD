import { useCallback, useEffect, useState } from "react";
import { Circle, Download, History, Play, Square } from "lucide-react";
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
  const [button, setButton] = useState(false);
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
          aria-label="Session name"
          placeholder="Session name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!status?.recording_id}
        />
        <input
          aria-label="Session notes"
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
            <Square size={13} />
            Stop saving
          </button>
        ) : (
          <button
            disabled={busy || status?.state !== "listening" || !name.trim()}
            onClick={() => run("/recording/start", { name, notes })}
          >
            <Circle size={13} />
            Start saving
          </button>
        )}
        {status?.config.kind === "mock" && (
          <button
            aria-pressed={button}
            onClick={async () => {
              try {
                await api("/mock/scenario", { button: !button });
                setButton(!button);
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          >
            Mock button · {button ? "ON" : "OFF"}
          </button>
        )}
      </div>
      <div className="tabs">
        <button
          className={tab === "sessions" ? "active" : ""}
          onClick={() => setTab("sessions")}
        >
          <History size={13} />
          Session history <span>{sessions.length}</span>
        </button>
        <button
          className={tab === "logs" ? "active" : ""}
          onClick={() => setTab("logs")}
        >
          Adapter diagnostics
        </button>
        <button className="refresh-history" onClick={refresh}>
          Refresh
        </button>
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
                    <Play size={12} />
                    Replay
                  </button>
                  {s.status !== "recording" && (
                    <a className="button" href={`/api/sessions/${s.id}/export`}>
                      <Download size={12} />
                      Export
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty">
              No sessions yet · Start recording to save full raw payloads
            </div>
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
