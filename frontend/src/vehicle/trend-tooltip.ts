import { signals, signalById, formatSignal } from "./signals";
import type { SignalId, VehicleSample } from "./signals";

export function orderedTrendSignals(selected: readonly SignalId[]): SignalId[] {
  return signals.filter((s) => selected.includes(s.id)).map((s) => s.id);
}

interface TooltipEntry {
  seriesId?: string;
  value?: unknown;
}
export function formatTrendTooltip(
  params: unknown,
  selected: readonly SignalId[],
  history: readonly VehicleSample[] = [],
): string {
  const entries = (Array.isArray(params) ? params : [params]).filter(
    (p): p is TooltipEntry => !!p && typeof p === "object",
  );
  const byId = new Map(entries.map((p) => [p.seriesId, p]));
  const first = entries.find(
    (p) => Array.isArray(p.value) && typeof p.value[0] === "number",
  );
  const timestamp = Array.isArray(first?.value)
    ? (first.value[0] as number)
    : null;
  const heading =
    timestamp !== null && Number.isFinite(timestamp)
      ? `<div class="vt-trend-tooltip-heading">${new Date(timestamp).toLocaleTimeString("en-US")}</div>`
      : "";
  // Linked axes may pass only the hovered subplot's series to the formatter.
  // Every subplot uses the same history timestamps, so use that exact plotted sample.
  const sample = history.find((row) => row.timestamp === timestamp);
  return (
    heading +
    orderedTrendSignals(selected)
      .map((id) => {
        const signal = signalById[id];
        const entry = byId.get(id);
        const raw = sample
          ? sample.values[id]
          : Array.isArray(entry?.value)
            ? entry.value[1]
            : null;
        const value =
          typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        return `<div class="vt-trend-tooltip-row" data-signal="${id}"><i style="background:${signal.color}"></i><span>${signal.name}</span><strong>${formatSignal(id, value)} ${signal.unit}</strong></div>`;
      })
      .join("")
  );
}
