import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Activity, ShieldCheck, Radio, X } from "lucide-react";
import { Controls } from "./components/Controls";
import { Monitor } from "./components/Monitor";
import { RawCharts } from "./charts/RawCharts";
import { Recordings } from "./components/Recordings";
import { ThemeToggle } from "./components/ThemeToggle";
import { DecodedSignals } from "./components/DecodedSignals";
import { monitor, useMonitor } from "./state/store";
const VehicleWorkspace = lazy(() => import("./vehicle/VehicleWorkspace"));
function Header({ onVehicle }: { onVehicle: () => void }) {
  const { status, connected } = useMonitor();
  return (
    <>
      <header>
        <div className="brand">
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          <div>
            <h1>
              CAN Observatory<span> / </span>
              <em>Workspace</em>
            </h1>
            <p>CAN ANALYSIS · EXPLICIT READ-ONLY DIAGNOSTICS</p>
          </div>
        </div>
        <div className="header-right">
          <span className="safe">
            <ShieldCheck size={14} />
            Passive capture · Optional PID reads
          </span>
          <span className={`connection ${connected ? "online" : ""}`}>
            <i />
            {connected ? "WebSocket online" : "WebSocket reconnecting"}
          </span>
          <span className="version">v0.1</span>
          <button onClick={onVehicle}>Vehicle demo</button>
          <ThemeToggle />
        </div>
      </header>
      <div className="status-strip">
        <span className="status-main">
          <Radio size={13} />
          {status?.state === "querying"
            ? "Reading PIDs"
            : status?.state === "listening"
              ? "Listening"
              : status?.state === "connected"
                ? "Connected"
                : status?.state === "error"
                  ? "Capture error"
                  : "Disconnected"}
        </span>
        <span className="source-tag">
          {!status || status.state === "disconnected"
            ? "NO ACTIVE SOURCE"
            : status?.config.kind === "mock"
              ? "SIMULATED DATA"
              : status?.config.kind === "replay"
                ? "RECORDED PLAYBACK"
                : status?.state === "listening"
                  ? "HARDWARE · SAMPLED · RECEIVE ONLY"
                  : status?.state === "querying"
                    ? "HARDWARE · ACTIVE PID READS"
                    : "HARDWARE · IDLE"}
        </span>
        <span>
          {status?.config.channel ?? "can0"} ·{" "}
          {status?.config.can_bitrate.toLocaleString("en-US") ?? "—"} bit/s
        </span>
        <span>Session: {status?.session_name ?? "—"}</span>
        <span className={status?.recording_id ? "recording" : "live-only"}>
          {status?.recording_id ? (
            <>
              <i />
              Saving raw data
            </>
          ) : (
            "Live only · Not saving"
          )}
        </span>
        <span className="strip-end">
          {status?.config.kind === "replay"
            ? "Original timestamps preserved"
            : status?.config.kind === "mock"
              ? "Timestamps: simulation"
              : "Timestamps: PC receive"}{" "}
          · Classical CAN
        </span>
      </div>
    </>
  );
}
function Metrics() {
  const { status } = useMonitor();
  const stats = status?.stats;
  return (
    <div className="metrics">
      <div>
        <span>Backend receive rate</span>
        <strong>
          {stats?.fps.toLocaleString("en-US") ?? "0"}
          <small>Frames/s</small>
        </strong>
        <p>Capture rate · independent of display</p>
      </div>
      <div>
        <span>Active CAN IDs</span>
        <strong>
          {stats?.active_ids ?? 0}
          <small>IDs</small>
        </strong>
        <p>Frames received in the last 2 seconds</p>
      </div>
      <div>
        <span>Received frames</span>
        <strong>
          {stats?.received_frames.toLocaleString("en-US") ?? "0"}
          <small>Frames</small>
        </strong>
        <p>Total for the current source connection</p>
      </div>
      <div>
        <span>Data integrity</span>
        <strong
          className={
            stats?.queue_drops || stats?.buffer_overflows ? "warning" : "mint"
          }
        >
          {(stats?.queue_drops ?? 0) + (stats?.buffer_overflows ?? 0)}
          <small>Drops / overflow events</small>
        </strong>
        <p>
          Queue drops {stats?.queue_drops ?? 0} · Adapter overflows{" "}
          {stats?.buffer_overflows ?? 0}
        </p>
      </div>
    </div>
  );
}
function SystemStatus() {
  const { status, displayHz } = useMonitor();
  const s = status?.stats;
  return (
    <footer>
      <span>
        <i className="dot" />
        System status
      </span>
      <span>
        Serial RX {s?.received_bytes.toLocaleString("en-US") ?? 0} bytes
      </span>
      <span>Parsed {s?.parsed_frames.toLocaleString("en-US") ?? 0}</span>
      <span>Parse errors {s?.parse_errors ?? 0}</span>
      <span>Display drops {s?.ws_drops ?? 0}</span>
      <span>ID evictions {s?.analysis_evictions ?? 0}</span>
      <span>Write errors {s?.storage_errors ?? 0}</span>
      <span className="footer-end">
        Display {displayHz.toFixed(1)} Hz · 60s buffer
      </span>
    </footer>
  );
}
function CaptureError() {
  const { status } = useMonitor();
  return status?.last_error ? (
    <div className="error-banner" role="alert">
      {status.last_error}
    </div>
  ) : null;
}
function CaptureWorkspace({ onVehicle }: { onVehicle: () => void }) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const onError = useCallback((text: string) => setError(text), []);
  useEffect(() => monitor.start(), []);
  return (
    <>
      <Header onVehicle={onVehicle} />
      <main>
        <Controls onError={onError} />
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        <CaptureError />
        <Metrics />
        <Monitor selected={selected} onSelect={setSelected} />
        <RawCharts selected={selected} />
        <DecodedSignals />
        <Recordings onError={onError} />
      </main>
      <SystemStatus />
    </>
  );
}

export default function App() {
  const readView = () =>
    new URLSearchParams(location.search).get("view") === "vehicle";
  const [vehicle, setVehicle] = useState(readView);
  useEffect(() => {
    const onPop = () => setVehicle(readView());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  function navigate(showVehicle: boolean) {
    const url = new URL(location.href);
    url.searchParams.set("view", showVehicle ? "vehicle" : "capture");
    history.pushState({}, "", url);
    setVehicle(showVehicle);
  }
  return vehicle ? (
    <Suspense
      fallback={<p style={{ padding: 30 }}>Loading vehicle workspace…</p>}
    >
      <VehicleWorkspace onCapture={() => navigate(false)} />
    </Suspense>
  ) : (
    <CaptureWorkspace onVehicle={() => navigate(true)} />
  );
}
