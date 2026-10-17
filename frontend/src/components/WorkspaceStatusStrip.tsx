import { Radio } from "lucide-react";
export function WorkspaceStatusStrip({
  state,
  source,
  detail,
  count,
  saving,
  timestamps,
}: {
  state: string;
  source: string;
  detail: string;
  count: string;
  saving: "active" | "armed" | "off";
  timestamps: string;
}) {
  return (
    <div
      className="status-strip workspace-status-strip"
      aria-label="Workspace status"
    >
      <span className="status-main">
        <Radio size={14} />
        {state}
      </span>
      <span className="source-tag">{source}</span>
      <span className="status-detail">{detail}</span>
      <span className="status-count">{count}</span>
      <span
        className={saving === "active" ? "recording" : "live-only"}
        data-saving={saving}
      >
        {saving === "active"
          ? "Saving"
          : saving === "armed"
            ? "Waiting for first response"
            : "Not saving"}
      </span>
      <span className="status-timestamps">{timestamps}</span>
    </div>
  );
}
