import { Activity } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
export function WorkspaceHeader({
  view,
  onNavigate,
  connected,
}: {
  view: "capture" | "vehicle";
  onNavigate: (view: "capture" | "vehicle") => void;
  connected: boolean;
}) {
  return (
    <header className="workspace-header">
      <div className="brand">
        <span className="brand-icon">
          <Activity size={26} />
        </span>
        <div>
          <h1>CAN Observatory</h1>
          <p>Local vehicle data workspace</p>
        </div>
      </div>
      <nav className="workspace-nav" aria-label="Workspace navigation">
        <button
          aria-current={view === "capture" ? "page" : undefined}
          onClick={() => onNavigate("capture")}
        >
          Raw CAN
        </button>
        <button
          aria-current={view === "vehicle" ? "page" : undefined}
          onClick={() => onNavigate("vehicle")}
        >
          Vehicle
        </button>
      </nav>
      <div className="header-right">
        <span className={`connection ${connected ? "online" : ""}`}>
          <i />
          {connected ? "Backend online" : "Backend offline"}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
