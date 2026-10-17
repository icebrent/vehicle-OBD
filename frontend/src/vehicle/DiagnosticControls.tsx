import { useEffect, useState } from "react";
import { api } from "../api";
import type { DIDState } from "./live";
interface Session {
  id: string;
  name: string;
  started_at: string;
  count: number;
  state: string;
}
export function DiagnosticControls({
  status,
  refresh,
}: {
  status: DIDState | null;
  refresh: () => Promise<void>;
}) {
  const [ports, setPorts] = useState<{ device: string; description: string }[]>(
    [],
  );
  const [port, setPort] = useState("");
  const [name, setName] = useState("Dolphin battery observation");
  const [save, setSave] = useState(false);
  const [modules, setModules] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [markerMessage, setMarkerMessage] = useState("");
  const running =
    !!status && ["starting", "live", "replaying"].includes(status.state);
  async function history() {
    setSessions(await api<Session[]>("/vehicle/sessions"));
  }
  useEffect(() => {
    void history().catch((e) => setError(e.message));
  }, [status?.recording_id, status?.state]);
  async function run(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      if (path === "/vehicle/markers")
        setMarkerMessage(
          `Observation saved at ${new Date().toLocaleTimeString("en-US")}`,
        );
      await refresh();
      await history();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="vt-live-controls"
      aria-label="Diagnostic reading and recording controls"
    >
      <div className="vt-live-control-row">
        <label>
          COM port
          <select
            aria-label="Diagnostic COM port"
            value={port}
            disabled={running}
            onChange={(e) => setPort(e.target.value)}
          >
            <option value="">Select outgoing port</option>
            {ports.map((p) => (
              <option key={p.device} value={p.device}>
                {p.device} · {p.description}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={async () => {
            try {
              setPorts(await api("/ports"));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Refresh ports
        </button>
        <label>
          Session name
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            aria-label="Diagnostic session name"
          />
        </label>
        <label className="vt-save-toggle">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
          />
          Save after first response
        </label>
        <button
          disabled={busy || running || !port}
          onClick={() =>
            run("/vehicle/start", {
              port,
              name,
              save_after_first_response: save,
              include_modules: modules,
            })
          }
        >
          Start DID reads
        </button>
        <label className="vt-save-toggle">
          <input
            type="checkbox"
            checked={modules}
            disabled={running}
            onChange={(event) => setModules(event.target.checked)}
          />
          Read battery groups (experimental)
        </label>
        <button
          disabled={busy || !running}
          onClick={() => run("/vehicle/stop")}
        >
          Stop reads / replay
        </button>
        <button
          disabled={busy || status?.state !== "live"}
          onClick={() =>
            run(
              status?.saving_armed
                ? "/vehicle/saving/stop"
                : "/vehicle/saving/start",
              { name },
            )
          }
        >
          {status?.saving_armed ? "Stop saving" : "Start saving"}
        </button>
      </div>
      <p className="vt-detail-note">
        {status?.state ?? "Offline"} · {status?.received ?? 0} responses ·{" "}
        {status?.recording_id
          ? "SAVING RAW RESPONSES + VALUES"
          : status?.saving_armed
            ? "Saving armed: waiting for first valid response"
            : "Not saving"}{" "}
        · Fixed 7E7 → 7EF · Fixed read-only whitelist · 0.5 s wait after each
        response
      </p>
      <div className="vt-live-control-row" aria-label="Observation markers">
        <span>Mark observation (notes only):</span>
        {(
          [
            ["stationary", "Stationary"],
            ["forward", "Forward"],
            ["reverse", "Reverse"],
            ["ac_on", "A/C on"],
            ["ac_off", "A/C off"],
          ] as const
        ).map(([label, title]) => (
          <button
            key={label}
            disabled={busy || !status?.recording_id}
            onClick={() => run("/vehicle/markers", { label })}
          >
            {title}
          </button>
        ))}
        <span>Passenger / parked use only</span>
        <span role="status">{markerMessage}</span>
      </div>
      {(error || status?.last_error) && (
        <p role="alert" className="vt-live-error">
          {error || status?.last_error}
        </p>
      )}
      <details className="vt-provenance">
        <summary>
          <span>Diagnostic recordings / replay</span>
          <span>{sessions.length} sessions</span>
        </summary>
        {sessions.length === 0 && (
          <p className="vt-detail-note">No diagnostic recordings yet.</p>
        )}
        {sessions.map((s) => (
          <div key={s.id} className="vt-recording-row">
            <span>
              <strong>{s.name}</strong> ·{" "}
              {new Date(s.started_at).toLocaleString("en-US")} · {s.count}{" "}
              readings · {s.state}
            </span>
            <button
              disabled={running || busy || s.state === "recording"}
              onClick={() =>
                run("/vehicle/replay", { recording_id: s.id, speed: 1 })
              }
            >
              Replay
            </button>
            {s.state !== "recording" && (
              <a
                className="button"
                href={`/api/vehicle/sessions/${s.id}/export`}
              >
                Export NDJSON
              </a>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}
