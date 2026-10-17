import { useEffect, useState } from "react";
import { Play, Square, Circle, Download } from "lucide-react";
import { SourceCard } from "../components/SourceCard";
import { RefreshButton } from "../components/RefreshButton";
import { api } from "../api";
import { ReplaySelector } from "../components/ReplaySelector";
import { hasVehicleDecoder } from "./diagnostic-profiles";
import type { DiagnosticProfile } from "./diagnostic-profiles";
import type { DIDState } from "./live";
interface Session {
  id: string;
  name: string;
  started_at: string;
  count: number;
  state: string;
  definition_version: string;
}
export function DiagnosticControls({
  status,
  refresh,
  profiles,
  vehicleProfileId,
  onProfileChange,
}: {
  status: DIDState | null;
  refresh: () => Promise<void>;
  profiles: DiagnosticProfile[];
  vehicleProfileId: string;
  onProfileChange: (id: string) => void;
}) {
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [ports, setPorts] = useState<{ device: string; description: string }[]>(
    [],
  );
  const [port, setPort] = useState("");
  const [name, setName] = useState("Vehicle observation");
  const [save, setSave] = useState(false);
  const [modules, setModules] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running =
    !!status && ["starting", "live", "replaying"].includes(status.state);
  async function history() {
    setSessions(await api<Session[]>("/vehicle/sessions"));
  }
  useEffect(() => {
    void history().catch((e) => setError(e.message));
  }, [status?.recording_id, status?.state]);
  useEffect(() => {
    if (status?.state === "replaying") setMode("replay");
  }, [status?.state]);
  useEffect(() => {
    if (!sessions.some((s) => s.id === selected && s.state !== "recording"))
      setSelected(sessions.find((s) => s.state !== "recording")?.id ?? "");
  }, [sessions, selected]);
  async function run(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      await refresh();
      await history();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedSession = sessions.find((s) => s.id === selected);
  const profile = profiles.find((p) => p.id === vehicleProfileId);
  function startSelected() {
    if (!profile || !hasVehicleDecoder(profile)) {
      window.alert("Select a vehicle model before starting.");
      document.getElementById("diagnostic-profile")?.focus();
      return;
    }
    if (
      mode === "replay" &&
      selectedSession?.definition_version !== profile.definition_version
    ) {
      setError(
        "Recording definition does not match the selected vehicle model",
      );
      return;
    }
    void (mode === "replay"
      ? run("/vehicle/replay", {
          vehicle_profile_id: profile.id,
          recording_id: selected,
          speed: 1,
        })
      : run("/vehicle/start", {
          vehicle_profile_id: profile.id,
          port,
          name,
          save_after_first_response: save,
          include_modules: modules,
        }));
  }
  return (
    <SourceCard
      className="vehicle-source"
      label="Diagnostic reading and recording controls"
    >
      <div className="field source-field">
        <label htmlFor="diagnostic-source">Data source</label>
        <select
          id="diagnostic-source"
          aria-label="Diagnostic data source"
          value={mode}
          disabled={busy || running}
          onChange={(e) => setMode(e.target.value as "live" | "replay")}
        >
          <option value="live">Live DID · OBDLink MX+</option>
          <option value="replay">Replay · Saved recording</option>
        </select>
      </div>
      <div className="field vehicle-model-field">
        <label htmlFor="diagnostic-profile">Vehicle model</label>
        <select
          id="diagnostic-profile"
          aria-label="Vehicle model"
          value={vehicleProfileId}
          onChange={(e) => onProfileChange(e.target.value)}
          title={profile?.name ?? "Select a vehicle"}
        >
          <option value="">Select a vehicle</option>
          {profiles.filter(hasVehicleDecoder).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {mode === "replay" ? (
        <ReplaySelector
          sessions={sessions}
          value={selected}
          onChange={setSelected}
          disabled={running || busy}
          unit="readings"
          label="Diagnostic recording"
          onRefresh={() => void history().catch((e) => setError(e.message))}
          refreshing={busy}
        />
      ) : (
        <div className="field port-field">
          <label htmlFor="diagnostic-port">COM port</label>
          <div className="inline">
            <select
              id="diagnostic-port"
              aria-label="Diagnostic COM port"
              title={
                port
                  ? `${port} · ${ports.find((p) => p.device === port)?.description ?? "Serial port"}`
                  : "Select a port"
              }
              value={port}
              disabled={running}
              onChange={(e) => setPort(e.target.value)}
            >
              <option value="">Select a port</option>
              {ports.map((p) => (
                <option key={p.device} value={p.device}>
                  {p.device} · {p.description}
                </option>
              ))}
            </select>
            <RefreshButton
              label="Refresh ports"
              disabled={busy}
              onClick={async () => {
                try {
                  setPorts(await api("/ports"));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </div>
        </div>
      )}
      {mode === "live" && (
        <>
          <div className="field recording-name-field">
            <label htmlFor="diagnostic-name">Recording name</label>
            <input
              id="diagnostic-name"
              aria-label="Diagnostic session name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label
            className="source-check"
            title="Save after the first valid response"
          >
            <input
              type="checkbox"
              aria-label="Save after first response"
              checked={save}
              disabled={running}
              onChange={(e) => setSave(e.target.checked)}
            />
            Auto-save
          </label>
          <label
            className="source-check"
            title="Read battery groups (experimental)"
          >
            <input
              type="checkbox"
              aria-label="Read battery groups (experimental)"
              checked={modules}
              disabled={running}
              onChange={(e) => setModules(e.target.checked)}
            />
            Battery groups
          </label>
        </>
      )}
      <div className="control-buttons">
        <button
          className="primary"
          aria-label={mode === "replay" ? "Start replay" : "Start DID reads"}
          title={mode === "replay" ? "Start replay" : "Start DID reads"}
          disabled={
            busy ||
            running ||
            (!!profile &&
              (mode === "replay"
                ? !selectedSession || selectedSession.state === "recording"
                : !port))
          }
          onClick={startSelected}
        >
          <Play size={16} />
          Start
        </button>
        <button
          disabled={busy || !running}
          onClick={() => run("/vehicle/stop")}
        >
          <Square size={16} />
          Stop
        </button>
        {mode === "live" && (
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
            {status?.saving_armed ? <Square size={16} /> : <Circle size={16} />}
            {status?.saving_armed ? "Stop saving" : "Start saving"}
          </button>
        )}
        {mode === "replay" &&
          selectedSession &&
          selectedSession.state !== "recording" && (
            <a
              className="button"
              href={`/api/vehicle/sessions/${selected}/export`}
            >
              <Download size={16} />
              Export NDJSON
            </a>
          )}
      </div>

      {(error || status?.last_error) && (
        <p role="alert" className="source-error">
          {error || status?.last_error}
        </p>
      )}
    </SourceCard>
  );
}
