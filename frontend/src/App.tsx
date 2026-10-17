import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { WorkspaceStatusStrip } from "./components/WorkspaceStatusStrip";
import { Controls } from "./components/Controls";
import { Monitor } from "./components/Monitor";
import { RawCharts } from "./charts/RawCharts";
import { Recordings } from "./components/Recordings";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { DecodedSignals } from "./components/DecodedSignals";
import { monitor, useMonitor } from "./state/store";
const VehicleWorkspace = lazy(() => import("./vehicle/VehicleWorkspace"));
function Header({ onVehicle }: { onVehicle: () => void }) {
  const { status, connected } = useMonitor();
  return (
    <>
      <WorkspaceHeader
        view="capture"
        connected={connected}
        onNavigate={(view) => {
          if (view === "vehicle") onVehicle();
        }}
      />
      <WorkspaceStatusStrip
        state={
          status?.state === "querying"
            ? "Reading PIDs"
            : status?.state === "listening"
              ? status.config.kind === "replay"
                ? "Replaying"
                : "Listening"
              : status?.state === "connected"
                ? "Connected"
                : status?.state === "error"
                  ? "Error"
                  : "Disconnected"
        }
        source={
          !status || status.state === "disconnected"
            ? "NO ACTIVE SOURCE"
            : status.config.kind === "replay"
              ? "RECORDED PLAYBACK"
              : "RAW CAN"
        }
        detail={`${status?.config.channel ?? "can0"} · ${(status?.config.can_bitrate ?? 500000).toLocaleString("en-US")} bit/s`}
        count={`${(status?.stats.received_frames ?? 0).toLocaleString("en-US")} frames`}
        saving={status?.recording_id ? "active" : "off"}
        timestamps={
          status?.config.kind === "replay"
            ? "Original timestamps"
            : "PC receive timestamps"
        }
      />
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
