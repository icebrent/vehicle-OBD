import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { idLabel, useMonitor } from "../state/store";
import { useTheme } from "../state/theme";
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);
const darkColors = [
  "#48dfbd",
  "#68a8ff",
  "#edbb62",
  "#c08dff",
  "#ff838c",
  "#6bd3e6",
  "#e49bd7",
  "#a5b570",
];
function Chart({
  option,
  label,
}: {
  option: EChartsCoreOption;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current, undefined, {
      renderer: "canvas",
    });
    const resize = new ResizeObserver(() => chart.current?.resize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);
  return <div ref={ref} className="chart" role="img" aria-label={label} />;
}
function chartBase(light: boolean) {
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      backgroundColor: light ? "#ffffff" : "#16212d",
      borderColor: light ? "#cbd8e4" : "#2c3b4c",
      textStyle: { color: light ? "#25384c" : "#dce6f1" },
    },
    grid: { left: 42, right: 16, top: 15, bottom: 28 },
    xAxis: {
      type: "time",
      axisLabel: { color: light ? "#526a80" : "#657b91", fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: light ? "#526a80" : "#657b91", fontSize: 10 },
      splitLine: { lineStyle: { color: light ? "#e0e7ef" : "#1b2936" } },
    },
  };
}
export function RawCharts({ selected }: { selected: string }) {
  const { resolved } = useTheme();
  const light = resolved === "light";
  const base = chartBase(light);
  const colors = light
    ? [
        "#087f6b",
        "#2563c6",
        "#a56a06",
        "#8148c4",
        "#cc3b54",
        "#087e99",
        "#ad3a86",
        "#667b12",
      ]
    : darkColors;
  const state = useMonitor();
  const row =
    state.rows.find((r) => r.key === selected) ??
    state.rows.reduce<(typeof state.rows)[number] | undefined>(
      (a, b) => (!a || b.frame.arbitration_id < a.frame.arbitration_id ? b : a),
      undefined,
    );
  const [enabled, setEnabled] = useState([0, 1, 2, 3]);
  const points = row ? (state.points.get(row.key) ?? []) : [];
  const raw = {
    ...base,
    color: colors,
    yAxis: { ...base.yAxis, min: 0, max: 255 },
    series: enabled.map((i) => ({
      name: `Byte ${i}`,
      type: "line",
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 1.5 },
      data: points.map((p) => [p.t, p.bytes[i]]),
    })),
  };
  const overview = {
    ...base,
    color: colors,
    series: [
      {
        type: "line",
        showSymbol: false,
        areaStyle: { opacity: 0.08 },
        data: state.overview.map((p) => [p[0], p[1]]),
      },
    ],
  };
  const activity = {
    ...base,
    grid: { left: 75, right: 22, top: 4, bottom: 20 },
    xAxis: {
      type: "value",
      axisLabel: { color: light ? "#526a80" : "#657b91" },
      splitLine: { lineStyle: { color: light ? "#e0e7ef" : "#1b2936" } },
    },
    yAxis: {
      type: "category",
      data: state.rows.slice(0, 12).map(idLabel),
      axisLabel: { color: light ? "#526a80" : "#8ba0b5" },
    },
    series: [
      {
        type: "bar",
        data: state.rows.slice(0, 12).map((r) => r.hz),
        barMaxWidth: 10,
        itemStyle: { color: colors[0], borderRadius: 2 },
      },
    ],
  };
  return (
    <div className="charts-layout">
      <section className="panel raw-chart">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RAW BYTE INSPECTOR</span>
            <h2>
              {row ? `0x${idLabel(row)}` : "Select a CAN ID"}{" "}
              <span className="subtle">Raw bytes · 0–255</span>
            </h2>
          </div>
          <span className="tag">60s window</span>
        </div>
        <div className="byte-select">
          {colors.map((color, i) => (
            <label
              key={i}
              style={{ color: enabled.includes(i) ? color : "#677e93" }}
            >
              <input
                type="checkbox"
                checked={enabled.includes(i)}
                onChange={() =>
                  setEnabled(
                    enabled.includes(i)
                      ? enabled.filter((n) => n !== i)
                      : [...enabled, i],
                  )
                }
              />
              Byte {i}
            </label>
          ))}
        </div>
        <Chart label="Raw byte time series" option={raw} />
        <div className="panel-footer">
          Missing bytes are null · Sampled per batch · No signal decoding
        </div>
      </section>
      <section className="panel overview-chart">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BUS ACTIVITY</span>
            <h2>
              Bus activity <span className="subtle">Frames/s</span>
            </h2>
          </div>
        </div>
        <Chart label="Bus receive rate chart" option={overview} />
      </section>
      <section className="panel activity-chart">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ID ACTIVITY</span>
            <h2>
              Frame activity <span className="subtle">Hz</span>
            </h2>
          </div>
        </div>
        <Chart label="CAN ID activity chart" option={activity} />
      </section>
    </div>
  );
}
