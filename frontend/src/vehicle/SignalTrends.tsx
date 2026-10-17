import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "../state/theme";
import { signalById } from "./signals";
import type { SignalId, VehicleSample } from "./signals";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer,
]);
export function SignalTrends({
  history,
  selected,
  windowSeconds,
}: {
  history: VehicleSample[];
  selected: SignalId[];
  windowSeconds: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const { resolved } = useTheme();
  useEffect(() => {
    if (!container.current) return;
    chart.current = echarts.init(container.current);
    const resize = new ResizeObserver(() => chart.current?.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    const end = history[history.length - 1]?.timestamp ?? Date.now();
    const start = end - windowSeconds * 1000;
    const text = resolved === "light" ? "#516174" : "#84929f";
    const split = resolved === "light" ? "#e0e6ec" : "#25313b";
    chart.current?.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          backgroundColor: resolved === "light" ? "#fff" : "#18212b",
          borderColor: split,
          textStyle: { color: text },
          valueFormatter: (v: unknown) =>
            typeof v === "number" ? v.toFixed(2) : String(v),
        },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: selected.map((_, i) => ({
          left: 69,
          right: 20,
          top: i * 104 + 23,
          height: 65,
        })),
        xAxis: selected.map((_, i) => ({
          type: "time",
          gridIndex: i,
          min: start,
          max: end,
          splitNumber: 4,
          axisLabel: {
            show: i === selected.length - 1,
            color: text,
            fontSize: 10,
            hideOverlap: true,
          },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        })),
        yAxis: selected.map((id, i) => ({
          type: "value",
          gridIndex: i,
          scale: true,
          name: "",
          nameTextStyle: { color: text, fontSize: 10 },
          axisLabel: { color: text, fontSize: 10 },
          splitNumber: 2,
          splitLine: { lineStyle: { color: split, type: "dashed" } },
        })),
        series: selected.map((id, i) => ({
          name: signalById[id].name,
          type: "line",
          xAxisIndex: i,
          yAxisIndex: i,
          showSymbol: false,
          step: history[0]?.source === "mock" ? false : "end",
          connectNulls: false,
          lineStyle: { width: 1.8, color: signalById[id].color },
          itemStyle: { color: signalById[id].color },
          data: history
            .filter((s) => s.timestamp >= start)
            .map((s) => [s.timestamp, s.values[id]]),
        })),
      },
      { notMerge: true },
    );
  }, [history, selected, windowSeconds, resolved]);
  return (
    <div className="vt-chart-wrap">
      {selected.map((id, i) => (
        <span
          key={id}
          className="vt-chart-label"
          style={{ top: 15 + i * 104, color: signalById[id].color }}
        >
          {signalById[id].name} · {signalById[id].unit}
        </span>
      ))}
      {selected.length === 0 && (
        <p className="vt-empty">Select a signal to build a time series.</p>
      )}
      <div
        ref={container}
        role="img"
        aria-label="Physical signal time series"
        style={{
          height: Math.max(170, selected.length * 104 + 14),
          visibility: selected.length ? "visible" : "hidden",
        }}
      />
    </div>
  );
}
