import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BatteryMedium,
  ChevronDown,
  CircleHelp,
  Cpu,
  Gauge,
  Pause,
  Play,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { hasVehicleDecoder } from "./diagnostic-profiles";
import type { DiagnosticProfile } from "./diagnostic-profiles";
import { WorkspaceStatusStrip } from "../components/WorkspaceStatusStrip";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { signals, signalById, formatSignal } from "./signals";
import type { SignalId } from "./signals";
import { VehicleDiagram } from "./VehicleDiagram";
import type { VehicleSection } from "./VehicleDiagram";
import { SignalTrends } from "./SignalTrends";
import { useDiagnosticVehicle } from "./live";
import { DiagnosticControls } from "./DiagnosticControls";
import "./vehicle.css";
export default function VehicleWorkspace({
  onCapture,
}: {
  onCapture: () => void;
}) {
  const [profiles, setProfiles] = useState<DiagnosticProfile[]>([]);
  const [vehicleProfileId, setVehicleProfileId] = useState("");
  const [profileError, setProfileError] = useState("");
  useEffect(() => {
    api<DiagnosticProfile[]>("/vehicle/profiles")
      .then(setProfiles)
      .catch((e) => setProfileError(e.message));
  }, []);
  const selectedProfile = profiles.find((p) => p.id === vehicleProfileId);
  const profile =
    selectedProfile && hasVehicleDecoder(selectedProfile)
      ? selectedProfile
      : null;
  const live = useDiagnosticVehicle(true, profile?.id ?? null);
  const { history, latest, paused, togglePause } = live;
  const replaying = live.status?.source === "replay";
  const [section, setSection] = useState<VehicleSection>("battery");
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [selected, setSelected] = useState<SignalId[]>([
    "voltage",
    "current",
    "temperature",
  ]);
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [limit, setLimit] = useState("");
  const [inspectedSignal, setInspectedSignal] = useState<SignalId>("voltage");
  const m = selectedModule
    ? latest.modules.find((module) => module.id === selectedModule)
    : null;
  function toggle(id: SignalId) {
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id));
      setLimit("");
    } else if (selected.length < 6) {
      setSelected([...selected, id]);
      setLimit("");
    } else setLimit("Select up to 6 signals at a time.");
  }
  function inspectModule(id: number) {
    setSection("battery");
    setSelectedModule(id);
    setModulesOpen(true);
  }
  const definition = signalById[inspectedSignal];
  function sparkline(id: SignalId) {
    const recent = history
      .slice(-24)
      .map((s) => s.values[id])
      .filter((v): v is number => v !== null);
    if (!recent.length) return "";
    const min = Math.min(...recent),
      range = Math.max(...recent) - min || 1;
    return recent
      .map((value, i) => `${i * 4.7},${18 - ((value - min) / range) * 15}`)
      .join(" ");
  }
  return (
    <div className="vt-workspace">
      <WorkspaceHeader
        view="vehicle"
        connected={!!live.status && !live.error}
        onNavigate={(view) => {
          if (view === "capture") onCapture();
        }}
      />
      <WorkspaceStatusStrip
        state={
          !live.status
            ? "Offline"
            : {
                idle: "Disconnected",
                starting: "Connecting",
                live: "Reading DIDs",
                stopped: "Stopped",
                error: "Error",
                replaying: "Replaying",
                complete: "Complete",
              }[live.status.state]
        }
        source={
          !live.status || live.status.state === "idle"
            ? "NO ACTIVE SOURCE"
            : replaying
              ? "RECORDED PLAYBACK"
              : "LIVE DID"
        }
        detail={
          profile
            ? `${profile.request_id} → ${profile.response_id} · Experimental DID`
            : "Vehicle model: —"
        }
        count={`${(live.status?.received ?? 0).toLocaleString("en-US")} responses`}
        saving={
          live.status?.recording_id
            ? "active"
            : live.status?.saving_armed
              ? "armed"
              : "off"
        }
        timestamps={replaying ? "Original timestamps" : "PC receive timestamps"}
      />
      <main className="vt-main">
        <DiagnosticControls
          status={live.status}
          refresh={live.refresh}
          profiles={profiles}
          vehicleProfileId={vehicleProfileId}
          onProfileChange={(id) => {
            setVehicleProfileId(id);
            setSelectedModule(null);
            setModulesOpen(false);
          }}
        />
        {profileError && (
          <p role="alert" className="vt-live-error">
            {profileError}
          </p>
        )}
        {live.error && (
          <p role="alert" className="vt-live-error">
            Backend unavailable: {live.error}.
          </p>
        )}
        <div className="vt-page-heading">
          <div>
            <span className="vt-kicker">PHYSICAL VALUES</span>
            <h1>Vehicle diagnostics</h1>
            {profile && (
              <p>
                {profile.name}
                {profile.experimental ? " · Experimental" : ""}
              </p>
            )}
          </div>
          {profile && (
            <div className="vt-playback">
              <button
                onClick={togglePause}
                aria-label={
                  paused ? "Resume vehicle display" : "Pause vehicle display"
                }
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
                <span>{paused ? "Resume display" : "Pause display"}</span>
              </button>
            </div>
          )}
        </div>
        {profile ? (
          <>
            <div className="vt-summary-strip">
              {(["soc", "voltage", "current", "power"] as SignalId[]).map(
                (id) => (
                  <button
                    key={id}
                    className={inspectedSignal === id ? "active" : ""}
                    onClick={() => {
                      setInspectedSignal(id);
                      setSection("battery");
                      setSelectedModule(null);
                    }}
                  >
                    <span>
                      {signalById[id].name}
                      {id === "power" && <small>CALCULATED</small>}
                    </span>
                    <strong>
                      {formatSignal(id, latest.values[id])}
                      <em>{signalById[id].unit}</em>
                    </strong>
                    <span className="vt-sparkline" aria-hidden="true">
                      <svg viewBox="0 0 110 20">
                        <polyline
                          points={sparkline(id)}
                          fill="none"
                          stroke={signalById[id].color}
                          strokeWidth="1.6"
                        />
                      </svg>
                    </span>
                  </button>
                ),
              )}
            </div>
            <div className="vt-overview-grid">
              <section
                className="vt-schematic-panel"
                aria-label="Vehicle overview"
              >
                <div className="vt-panel-heading">
                  <div className="vt-tabs">
                    <button
                      className={section === "battery" ? "selected" : ""}
                      onClick={() => {
                        setSection("battery");
                        setSelectedModule(null);
                      }}
                    >
                      <BatteryMedium size={15} />
                      High voltage
                    </button>
                    <button
                      className={section === "powertrain" ? "selected" : ""}
                      onClick={() => setSection("powertrain")}
                    >
                      <Cpu size={15} />
                      Powertrain
                    </button>
                  </div>
                  <span className="vt-subtle">
                    TOP VIEW <span>↑ FRONT</span>
                  </span>
                </div>
                <VehicleDiagram
                  sample={latest}
                  selectedModule={selectedModule}
                  onModule={inspectModule}
                  onSection={(s) => {
                    setSection(s);
                    setSelectedModule(null);
                  }}
                />
                <div className="vt-model-caption">
                  <span>
                    <span className="vt-key-dot" />
                    {`${latest.modules.length}/10 complete groups · Candidate temperatures`}
                  </span>
                </div>
              </section>
              <aside className="vt-inspector" aria-label="Component inspector">
                <div className="vt-panel-heading">
                  <span className="vt-kicker">COMPONENT INSPECTOR</span>
                  <SlidersHorizontal size={14} />
                </div>
                <div className="vt-inspector-content">
                  <div className="vt-component-icon">
                    {section === "battery" ? (
                      <BatteryMedium size={25} />
                    ) : (
                      <Gauge size={25} />
                    )}
                  </div>
                  <h2>
                    {section === "powertrain"
                      ? "Front powertrain"
                      : m
                        ? `Module ${String(m.id).padStart(2, "0")}`
                        : "HV battery pack"}
                  </h2>
                  <p className="vt-subtle">
                    {section === "powertrain"
                      ? "No verified signal mapping"
                      : m
                        ? "Illustrative location · Candidate structure"
                        : "7E7 → 7EF · Community definitions"}
                  </p>
                  {section === "powertrain" ? (
                    <>
                      <dl className="vt-readings">
                        <div>
                          <dt>Motor speed</dt>
                          <dd>
                            — <small>rpm</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Motor torque</dt>
                          <dd>
                            — <small>Nm</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Inverter temperature</dt>
                          <dd>
                            — <small>°C</small>
                          </dd>
                        </div>
                      </dl>
                      <p className="vt-inspector-note">
                        These signals are not mapped in the supplied log. No
                        synthetic motor values are shown.
                      </p>
                    </>
                  ) : m ? (
                    <>
                      <dl className="vt-readings">
                        <div>
                          <dt>Minimum cell voltage</dt>
                          <dd>
                            {m.minVoltage.toFixed(3)} <small>V</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Maximum cell voltage</dt>
                          <dd>
                            {m.maxVoltage.toFixed(3)} <small>V</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Voltage spread</dt>
                          <dd>
                            {((m.maxVoltage - m.minVoltage) * 1000).toFixed(1)}{" "}
                            <small>mV</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Temperature A (candidate)</dt>
                          <dd>
                            {m.minTemperature.toFixed(1)} <small>°C</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Temperature B (candidate)</dt>
                          <dd>
                            {m.maxTemperature.toFixed(1)} <small>°C</small>
                          </dd>
                        </div>
                      </dl>
                      <p className="vt-inspector-note">
                        DID block{" "}
                        {(0x16c + (m.id - 1) * 8).toString(16).toUpperCase()}–
                        {(0x173 + (m.id - 1) * 8).toString(16).toUpperCase()} ·
                        Structure inferred from the log; module mapping is
                        unverified.
                      </p>
                    </>
                  ) : (
                    <>
                      <dl className="vt-readings">
                        {(["temperature", "capacity"] as SignalId[]).map(
                          (id) => (
                            <div key={id}>
                              <dt>{signalById[id].name}</dt>
                              <dd>
                                {formatSignal(id, latest.values[id])}{" "}
                                <small>{signalById[id].unit}</small>
                              </dd>
                            </div>
                          ),
                        )}
                        <div>
                          <dt>Module blocks</dt>
                          <dd>
                            {latest.modules.length}{" "}
                            <small>
                              candidate groups with complete readings
                            </small>
                          </dd>
                        </div>
                        <div>
                          <dt>Sample source</dt>
                          <dd className="vt-accent">
                            {replaying ? "Recorded" : "Real DID"}
                          </dd>
                        </div>
                      </dl>
                      <div className="vt-definition">
                        <span className="vt-kicker">
                          SELECTED SIGNAL / {definition.evidence.toUpperCase()}
                        </span>
                        <strong>{definition.name}</strong>
                        <code>{definition.request}</code>
                        <p>{definition.note}</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="vt-inspector-foot">
                  <CircleHelp size={13} />
                  Schematic is not a verified vehicle layout.
                </div>
              </aside>
            </div>
            <details
              className="vt-module-details"
              open={modulesOpen}
              onToggle={(e) => setModulesOpen(e.currentTarget.open)}
            >
              <summary>
                <span>
                  <BatteryMedium size={16} />
                  <strong>Battery modules</strong>
                  <span>
                    10 candidate blocks · 80 responding DIDs in the log
                  </span>
                </span>
                <span>
                  Explore temperatures & cell voltage spread
                  <ChevronDown size={15} />
                </span>
              </summary>
              <p className="vt-detail-note">
                Sequential group sampling · Complete groups appear as responses
                arrive. Values older than 120 s are hidden. A/B temperature
                meanings and physical locations are unverified.
              </p>
              <div className="vt-modules-grid">
                {latest.modules.map((module) => (
                  <button
                    key={module.id}
                    aria-pressed={selectedModule === module.id}
                    onClick={() => inspectModule(module.id)}
                  >
                    <span>
                      M{String(module.id).padStart(2, "0")}
                      <small>
                        {replaying ? "REPLAY" : "REAL · EXPERIMENTAL"}
                      </small>
                    </span>
                    <strong>
                      {Math.max(
                        module.minTemperature,
                        module.maxTemperature,
                      ).toFixed(1)}
                      <em>°C</em>
                    </strong>
                    <div className="vt-thermal-bar">
                      <i style={{ width: `${45 + module.id * 2}%` }} />
                    </div>
                    <span>
                      {module.minVoltage.toFixed(3)}–
                      {module.maxVoltage.toFixed(3)} V
                    </span>
                    <span>
                      {(1000 * (module.maxVoltage - module.minVoltage)).toFixed(
                        1,
                      )}{" "}
                      mV · A {module.minTemperature.toFixed(0)}° / B{" "}
                      {module.maxTemperature.toFixed(0)}°
                    </span>
                    {module.timestamp && (
                      <span>
                        {new Date(module.timestamp).toLocaleTimeString("en-US")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="vt-detail-note">
                Each tile represents an illustrative module block, not an
                individual cell. Physical order, block identity and conversions
                need validation.
              </p>
            </details>
            <section className="vt-trends" aria-label="Physical signal trends">
              <div className="vt-panel-heading">
                <div>
                  <span className="vt-kicker">OBSERVE OVER TIME</span>
                  <h2>Signal trends</h2>
                </div>
                <div className="vt-window-controls">
                  <span className="vt-subtle">
                    Shared time axis · Separate value scales
                  </span>
                  <label htmlFor="trend-window" className="vt-sr-only">
                    Time window
                  </label>
                  <select
                    id="trend-window"
                    value={windowSeconds}
                    onChange={(e) => setWindowSeconds(+e.target.value)}
                  >
                    <option value={30}>Last 30 seconds</option>
                    <option value={60}>Last 60 seconds</option>
                    <option value={180}>Last 3 minutes</option>
                  </select>
                </div>
              </div>
              <div className="vt-trends-grid">
                <div className="vt-signal-picker">
                  <div className="vt-picker-heading">
                    <span>SIGNALS</span>
                    <span>{selected.length} / 6</span>
                  </div>
                  {signals.slice(0, 5).map((s) => (
                    <label
                      key={s.id}
                      className={selected.includes(s.id) ? "checked" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <i style={{ background: s.color }} />
                      <span>
                        <span className="vt-signal-name">
                          {s.name}
                          {s.evidence === "Derived" && (
                            <span
                              className="vt-derived-badge"
                              aria-label="Calculated value"
                              title="Calculated value: pack voltage × pack current / 1000. Measurements are sequential, not simultaneous."
                            >
                              CALC
                            </span>
                          )}
                        </span>
                        <small>
                          {s.unit} ·{" "}
                          {s.evidence === "Derived"
                            ? "Calculated"
                            : "Log response"}
                        </small>
                      </span>
                      <strong>{formatSignal(s.id, latest.values[s.id])}</strong>
                    </label>
                  ))}
                  <details className="vt-candidate-signals">
                    <summary>
                      Capacity & counters <ChevronDown size={12} />
                    </summary>
                    {signals.slice(5).map((s) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        <i style={{ background: s.color }} />
                        <span>
                          {s.name}
                          <small>{s.unit} · Unverified scaling</small>
                        </span>
                      </label>
                    ))}
                  </details>
                  {limit && (
                    <p role="status" className="vt-detail-note">
                      {limit}
                    </p>
                  )}
                </div>
                <SignalTrends
                  history={history}
                  selected={selected}
                  windowSeconds={windowSeconds}
                />
              </div>
            </section>
            <details className="vt-provenance">
              <summary>
                <span>
                  <CircleHelp size={15} />
                  Signal definitions & evidence
                </span>
                <ChevronDown size={15} />
              </summary>
              <div className="vt-evidence-table">
                <table>
                  <thead>
                    <tr>
                      <th>Signal</th>
                      <th>Request / calculation</th>
                      <th>Evidence</th>
                      <th>Validation note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>
                          <code>{s.request}</code>
                        </td>
                        <td>{s.evidence}</td>
                        <td>{s.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="vt-detail-note">
                References: supplied Car Scanner log ·{" "}
                <a
                  href="https://github.com/meatpiHQ/wican-fw/blob/main/vehicle_profiles.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  WiCAN definitions
                </a>{" "}
                ·{" "}
                <a
                  href="https://github.com/loryanstrant/BYD-PID-list"
                  target="_blank"
                  rel="noreferrer"
                >
                  Community DID list
                </a>
                . Candidate definitions remain experimental until independently
                verified.
              </p>
            </details>
            <div className="vt-bottom-note">
              <Zap size={13} />
              <span>
                {paused
                  ? "Display paused · Backend capture and saving continue"
                  : replaying
                    ? "Recorded playback · No hardware requests"
                    : `DID stream · ${live.status?.received ?? 0} responses`}
              </span>
              <span>
                {new Date(latest.timestamp).toLocaleTimeString("en-US", {
                  hour12: false,
                })}{" "}
                · 3 min bounded buffer
              </span>
              <button onClick={onCapture}>
                <ArrowLeft size={13} />
                Open raw workspace
              </button>
            </div>
          </>
        ) : (
          <p className="vt-empty-model">No vehicle selected</p>
        )}
      </main>
    </div>
  );
}
