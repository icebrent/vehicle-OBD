import { describe, expect, it } from "vitest";
import type { VehicleSample } from "./signals";
import { orderedTrendSignals, formatTrendTooltip } from "./trend-tooltip";

describe("trend display order", () => {
  it("uses Signals order after arbitrary selection and reselection", () => {
    expect(
      orderedTrendSignals([
        "temperature",
        "power",
        "current",
        "soc",
        "voltage",
      ]),
    ).toEqual(["soc", "voltage", "current", "power", "temperature"]);
  });
  it("sorts unordered hover entries and includes names and units", () => {
    const html = formatTrendTooltip(
      [
        { seriesId: "temperature", value: [1700000000000, 22] },
        { seriesId: "current", value: [1700000000000, -2] },
        { seriesId: "voltage", value: [1700000000000, 405] },
      ],
      ["temperature", "current", "voltage"],
    );
    expect(
      [...html.matchAll(/data-signal="([^"]+)"/g)].map((m) => m[1]),
    ).toEqual(["voltage", "current", "temperature"]);
    expect(html).toContain("Pack voltage");
    expect(html).toContain("405.0 V");
    expect(html).toContain("-2.0 A");
    expect(html).toContain("22.0 °C");
  });
  it("keeps missing hover data unknown without inventing zero", () => {
    expect(
      formatTrendTooltip(
        [{ seriesId: "power", value: [1700000000000, null] }],
        ["power"],
      ),
    ).toContain("— kW");
  });
  it("uses the exact plotted history sample when linked axes supply one series", () => {
    const sample: VehicleSample = {
      timestamp: 1700000000000,
      source: "replay",
      modules: [],
      values: {
        soc: 90,
        voltage: 405,
        current: -2,
        power: -0.81,
        temperature: null,
        capacity: null,
        chargeCount: null,
        chargedEnergy: null,
        dischargedEnergy: null,
      },
    };
    const html = formatTrendTooltip(
      [{ seriesId: "soc", value: [sample.timestamp, 90] }],
      ["temperature", "voltage", "current"],
      [sample],
    );
    expect(html).toContain("405.0 V");
    expect(html).toContain("-2.0 A");
    expect(html).toContain("— °C");
  });
});
