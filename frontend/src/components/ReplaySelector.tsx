import { RefreshButton } from "./RefreshButton";
export interface ReplayOption {
  id: string;
  name: string;
  started_at: string;
  count: number;
  state: string;
}
export function ReplaySelector({
  sessions,
  value,
  onChange,
  disabled,
  unit,
  label,
  onRefresh,
  refreshing,
}: {
  sessions: ReplayOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  unit: string;
  label: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const available = sessions.filter((s) => s.state !== "recording");
  const selected = available.find((s) => s.id === value);
  return (
    <div className="replay-selector">
      <label>
        {label}
        <div className="inline">
          <select
            aria-label={label}
            title={
              selected
                ? `${selected.name} · ${new Date(selected.started_at).toLocaleString("en-US")} · ${selected.count} ${unit}`
                : "Select a recording"
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || !available.length}
          >
            <option value="">
              {available.length ? "Select a recording" : "No saved recordings"}
            </option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {new Date(s.started_at).toLocaleString("en-US")} ·{" "}
                {s.count.toLocaleString("en-US")} {unit}
              </option>
            ))}
          </select>
          {onRefresh && (
            <RefreshButton
              label="Refresh recordings"
              disabled={refreshing}
              onClick={onRefresh}
            />
          )}
        </div>
      </label>
    </div>
  );
}
