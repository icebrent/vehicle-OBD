import { useEffect, useState } from "react";
import { Cable, Play, Square, Unplug, RefreshCw } from "lucide-react";
import { api } from "../api";
import { useMonitor } from "../state/store";
import type { Config, Profile, Status } from "../types";
export function Controls({ onError }: { onError: (text: string) => void }) {
  const { status } = useMonitor();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ports, setPorts] = useState<{ device: string; description: string }[]>(
    [],
  );
  const [config, setConfig] = useState<Config>({
    kind: "mock",
    monitor_strategy: "sampled_16",
    monitor_interval_seconds: 1,
    serial_baudrate: 115200,
    can_bitrate: 500000,
    channel: "can0",
    replay_speed: 1,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status) setConfig(status.config);
  }, [status?.capture_session_id]);
  useEffect(() => {
    api<Profile[]>("/profiles")
      .then(setProfiles)
      .catch((e) => onError(e.message));
  }, [onError]);
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
    <section className="controls panel" aria-label="Device controls">
      <div className="field">
        <label htmlFor="source">Data source</label>
        <select
          id="source"
          value={config.kind}
          disabled={locked || busy}
          onChange={(e) =>
            setConfig({ ...config, kind: e.target.value as Config["kind"] })
          }
        >
          <option value="mock">Mock · Simulated data</option>
          <option value="obdlink">OBDLink MX+ · Bluetooth</option>
          <option value="replay" disabled>
            Replay · Open from history
          </option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="port">COM port</label>
        <div className="inline">
          <select
            id="port"
            disabled={locked || config.kind !== "obdlink"}
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
          <button
            aria-label="Refresh ports"
            title="List COM ports"
            onClick={() =>
              api<typeof ports>("/ports")
                .then(setPorts)
                .catch((e) => onError(e.message))
            }
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
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
      <div className="control-buttons">
        <button
          disabled={locked || busy}
          onClick={() => run("/connect", config)}
        >
          <Cable size={14} />
          Connect
        </button>
        <button disabled={!locked || busy} onClick={() => run("/disconnect")}>
          <Unplug size={14} />
          Disconnect
        </button>
        <button
          className="primary"
          disabled={status?.state !== "connected" || busy}
          onClick={() => run("/capture/start")}
        >
          <Play size={14} />
          Start listening
        </button>
        <button
          disabled={status?.state !== "listening" || busy}
          onClick={() => run("/capture/stop")}
        >
          <Square size={13} />
          Stop
        </button>
      </div>
      <div className="vehicle field">
        <label htmlFor="profile">Vehicle profile · Decoder</label>
        <select
          id="profile"
          value={status?.profile_id ?? "generic"}
          onChange={(e) =>
            run("/profiles/select", { profile_id: e.target.value })
          }
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.experimental ? " · Experimental" : ""}
            </option>
          ))}
        </select>
      </div>
      {config.kind === "obdlink" && (
        <p className="hardware-note">
          Hardware access
          {status?.hardware_enabled
            ? "enabled by the local operator"
            : "locked (CAN_ENABLE_HARDWARE=0)"}{" "}
          · HS-CAN pins 6/14 · Sampled monitoring: 16 frames per batch, then a
          {config.monitor_interval_seconds ?? 1} s gap. Frames during gaps are
          missed; Hz shows observed sample rates. Confirm the bitrate manually.
          Selecting a profile does not change hardware settings.
        </p>
      )}
    </section>
  );
}
