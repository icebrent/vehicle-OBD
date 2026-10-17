import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BatteryMedium,
  ChevronDown,
  CircleHelp,
  Cpu,
  Gauge,
  Pause,
  Play,
  Radio,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { signals, signalById, formatSignal } from "./signals";
import type { SignalId } from "./signals";
import { useMockVehicle } from "./mock";
import type { Scenario } from "./mock";
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
  const [mode, setMode] = useState<"mock" | "live">(() =>
    new URLSearchParams(location.search).get("source") === "live"
      ? "live"
      : "mock",
  );
  const mock = useMockVehicle(mode === "mock");
  const live = useDiagnosticVehicle(mode === "live");
  const { history, latest, paused, togglePause } =
    mode === "mock" ? mock : live;
  const { scenario, setScenario } = mock;
  const isMock = mode === "mock";
  const replaying = !isMock && live.status?.source === "replay";
  function switchMode(next: "mock" | "live") {
    const url = new URL(location.href);
    url.searchParams.set("source", next);
    window.history.replaceState({}, "", url);
    setMode(next);
    setSelectedModule(null);
    setModulesOpen(false);
  }
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
      <header className="vt-header">
        <div className="vt-wordmark">
          <span className="vt-logo">
            <Radio size={21} />
          </span>
          <strong>CAN OBSERVATORY</strong>
          <span className="vt-slash">/</span>
          <span>Vehicle</span>
        </div>
        <div className="vt-header-actions">
          <span className="vt-mock-badge">
            <i />
            {isMock
              ? "MOCK DEMO"
              : replaying
                ? "RECORDED REPLAY"
                : "REAL DID READS"}
          </span>
          <ThemeToggle />
          <button onClick={onCapture}>
            <ArrowUpRight size={14} />
            Raw workspace
          </button>
        </div>
      </header>
      <div className="vt-demo-notice">
        <span>
          <i />
          {isMock
            ? "Simulated physical values · No vehicle connection or diagnostic requests"
            : replaying
              ? "Recorded diagnostic responses · Original timestamps · No hardware requests"
              : "Active read-only DID requests · Experimental decoding · Missing / stale values show —"}
        </span>
        <span>
          {isMock
            ? "Live display only · Not saving"
            : live.status?.recording_id
              ? "Saving raw responses + values"
              : "Not saving"}
        </span>
      </div>
      <main className="vt-main">
        <nav className="vt-source-switch" aria-label="Vehicle data source">
          <button aria-pressed={isMock} onClick={() => switchMode("mock")}>
            Mock demo
          </button>
          <button aria-pressed={!isMock} onClick={() => switchMode("live")}>
            Live DID / Replay
          </button>
          <span>Display selection does not start or stop backend tasks.</span>
        </nav>
        {!isMock && (
          <>
            <DiagnosticControls status={live.status} refresh={live.refresh} />
            {live.error && (
              <p role="alert" className="vt-live-error">
                Backend unavailable: {live.error}. No mock fallback.
              </p>
            )}
          </>
        )}
        <div className="vt-page-heading">
          <div>
            <span className="vt-kicker">VEHICLE TELEMETRY / 01</span>
            <h1>
              Energy, in view<span>.</span>
            </h1>
            <p>
              BYD Dolphin / Japan <span>·</span> Experimental signal workspace
            </p>
          </div>
          <div className="vt-playback">
            {isMock && (
              <>
                <label htmlFor="demo-scenario">Demo scenario</label>
                <select
                  id="demo-scenario"
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value as Scenario)}
                >
                  <option value="idle">Stationary</option>
                  <option value="driving">Discharging</option>
                  <option value="regen">Regeneration</option>
                </select>
              </>
            )}
            <button
              onClick={togglePause}
              aria-label={
                paused ? "Resume vehicle display" : "Pause vehicle display"
              }
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
              <span>{paused ? "Resume" : "Pause"}</span>
            </button>
          </div>
        </div>
        <div className="vt-summary-strip">
          {(["soc", "voltage", "current", "power"] as SignalId[]).map((id) => (
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
          ))}
        </div>
        <div className="vt-overview-grid">
          <section className="vt-schematic-panel" aria-label="Vehicle overview">
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
                {isMock
                  ? "Mock module temperature"
                  : `${latest.modules.length}/10 complete groups · Candidate temperatures`}
              </span>
              <span>Click a component to inspect</span>
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
                      <dt>
                        {isMock
                          ? "Minimum temperature"
                          : "Temperature A (candidate)"}
                      </dt>
                      <dd>
                        {m.minTemperature.toFixed(1)} <small>°C</small>
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {isMock
                          ? "Maximum temperature"
                          : "Temperature B (candidate)"}
                      </dt>
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
                    {(["temperature", "capacity"] as SignalId[]).map((id) => (
                      <div key={id}>
                        <dt>{signalById[id].name}</dt>
                        <dd>
                          {formatSignal(id, latest.values[id])}{" "}
                          <small>{signalById[id].unit}</small>
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt>Module blocks</dt>
                      <dd>
                        {latest.modules.length}{" "}
                        <small>candidate groups with complete readings</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Sample source</dt>
                      <dd className="vt-accent">
                        {isMock
                          ? "Simulated"
                          : replaying
                            ? "Recorded"
                            : "Real DID"}
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
              <span>10 candidate blocks · 80 responding DIDs in the log</span>
            </span>
            <span>
              Explore temperatures & cell voltage spread
              <ChevronDown size={15} />
            </span>
          </summary>
          {!isMock && (
            <p className="vt-detail-note">
              Sequential group sampling · Complete groups appear as responses
              arrive. Values older than 120 s are hidden. A/B temperature
              meanings and physical locations are unverified.
            </p>
          )}
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
                    {isMock
                      ? "MOCK"
                      : replaying
                        ? "REPLAY"
                        : "REAL · EXPERIMENTAL"}
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
                  {module.minVoltage.toFixed(3)}–{module.maxVoltage.toFixed(3)}{" "}
                  V
                </span>
                <span>
                  {(1000 * (module.maxVoltage - module.minVoltage)).toFixed(1)}{" "}
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
            Each tile represents an illustrative module block, not an individual
            cell. Physical order, block identity and conversions need
            validation.
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
                    {s.name}
                    <small>
                      {s.unit} ·{" "}
                      {s.evidence === "Derived" ? "Calculated" : "Log response"}
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
              <p className="vt-picker-note">
                {isMock
                  ? "All values are simulated. A log response confirms availability, not signal meaning."
                  : "Experimental decoding · Core reads alternate with one battery group (4 requests), with a 0.5 s wait after each response. Updates depend on ECU and Bluetooth latency. Core values expire after 45 s; groups after 120 s. Power uses sequential measurements."}
              </p>
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
              ? isMock
                ? "Display paused · Mock sampling continues"
                : "Display paused · Backend capture and saving continue"
              : isMock
                ? "Mock stream · 2 samples/s"
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
      </main>
    </div>
  );
}
