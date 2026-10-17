import { useEffect, useState } from "react";
import { Cable, Play, Square, Unplug } from "lucide-react";
import { SourceCard } from "./SourceCard";
import { RefreshButton } from "./RefreshButton";
import { api } from "../api";
import { useMonitor } from "../state/store";
import { ReplaySelector } from "./ReplaySelector";
import type { Config, Status, Session } from "../types";
export function Controls({ onError }: { onError: (text: string) => void }) {
  const { status } = useMonitor();
  const [ports, setPorts] = useState<{ device: string; description: string }[]>(
    [],
  );
  const [config, setConfig] = useState<Config>({
    kind: "obdlink",
    monitor_strategy: "sampled_16",
    monitor_interval_seconds: 1,
    serial_baudrate: 115200,
    can_bitrate: 500000,
    channel: "can0",
    replay_speed: 1,
  });
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    if (config.kind !== "replay") return;
    api<Session[]>("/sessions")
      .then(setSessions)
      .catch((e) => onError(e.message));
  }, [config.kind, status?.recording_id, onError]);

  useEffect(() => {
    if (status) setConfig(status.config);
  }, [status?.capture_session_id]);
  const run = async (path: string, body: unknown = {}) => {
    setBusy(true);
    try {
      await api<Status>(path, body);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const locked = status?.state !== "disconnected";
  return (
    <SourceCard label="Device controls">
      <div className="field source-field">
        <label htmlFor="source">Data source</label>
        <select
          id="source"
          value={config.kind}
          disabled={locked || busy}
          onChange={(e) =>
            setConfig({ ...config, kind: e.target.value as Config["kind"] })
          }
        >
          <option value="obdlink">OBDLink MX+ · Bluetooth</option>
          <option value="replay">Replay · Saved recording</option>
        </select>
      </div>
      {config.kind === "replay" ? (
        <ReplaySelector
          sessions={sessions.map((s) => ({
            id: s.id,
            name: s.name,
            started_at: s.started_at,
            count: s.frame_count,
            state: s.status,
          }))}
          value={config.replay_session_id ?? ""}
          onChange={(id) => setConfig({ ...config, replay_session_id: id })}
          disabled={locked || busy}
          unit="frames"
          label="Raw CAN recording"
          onRefresh={() =>
            api<Session[]>("/sessions")
              .then(setSessions)
              .catch((e) => onError(e.message))
          }
          refreshing={busy}
        />
      ) : (
        <div className="field port-field">
          <label htmlFor="port">COM port</label>
          <div className="inline">
            <select
              id="port"
              title={
                config.port
                  ? `${config.port} · ${ports.find((p) => p.device === config.port)?.description ?? "Serial port"}`
                  : "Select a port"
              }
              disabled={locked}
              value={config.port ?? ""}
              onChange={(e) =>
                setConfig({ ...config, port: e.target.value || undefined })
              }
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
              onClick={() =>
                api<typeof ports>("/ports")
                  .then(setPorts)
                  .catch((e) => onError(e.message))
              }
            />
          </div>
        </div>
      )}
      {config.kind === "obdlink" && (
        <>
          <div className="field narrow">
            <label htmlFor="bitrate">CAN · bit/s</label>
            <select
              id="bitrate"
              disabled={locked}
              value={config.can_bitrate}
              onChange={(e) =>
                setConfig({ ...config, can_bitrate: +e.target.value })
              }
            >
              {[125000, 250000, 500000, 1000000].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="field narrow">
            <label htmlFor="serial-rate">Serial · baud</label>
            <select
              id="serial-rate"
              disabled={locked}
              value={config.serial_baudrate}
              onChange={(e) =>
                setConfig({ ...config, serial_baudrate: +e.target.value })
              }
            >
              {[9600, 38400, 57600, 115200, 230400].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="control-buttons">
        <button
          disabled={
            locked ||
            busy ||
            (config.kind === "replay" && !config.replay_session_id)
          }
          onClick={() => run("/connect", config)}
        >
          <Cable size={16} />
          {config.kind === "replay" ? "Load replay" : "Connect"}
        </button>
        <button disabled={!locked || busy} onClick={() => run("/disconnect")}>
          <Unplug size={16} />
          Disconnect
        </button>
        <button
          className="primary"
          aria-label={
            config.kind === "replay" ? "Start replay" : "Start listening"
          }
          title={config.kind === "replay" ? "Start replay" : "Start listening"}
          disabled={status?.state !== "connected" || busy}
          onClick={() => run("/capture/start")}
        >
          <Play size={16} />
          Start
        </button>
        <button
          disabled={status?.state !== "listening" || busy}
          onClick={() => run("/capture/stop")}
        >
          <Square size={16} />
          Stop
        </button>
      </div>
    </SourceCard>
  );
}
