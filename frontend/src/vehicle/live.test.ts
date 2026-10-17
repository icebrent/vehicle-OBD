import { expect, it } from "vitest";
import { reconstructHistory } from "./live";
import type { DIDReading } from "./live";
function reading(
  signal_id: DIDReading["signal_id"],
  value: number,
  offset: number,
): DIDReading {
  return {
    signal_id,
    value,
    timestamp_utc: new Date(1700000000000 + offset).toISOString(),
    timestamp_monotonic: offset / 1000,
    unit: "",
    raw_response: "preserved",
    request: "220008",
    validation: "experimental",
  };
}
it("never substitutes mock values and preserves signed readings in replay", () => {
  const samples = reconstructHistory(
    [reading("voltage", 405, 0), reading("current", -2, 5000)],
    "replay",
  );
  expect(samples[0].values.soc).toBeNull();
  expect(samples[0].values.power).toBeNull();
  expect(samples[1].values.power).toBeCloseTo(-0.81);
  expect(samples[1].values.capacity).toBeNull();
  expect(samples[1].modules).toEqual([]);
  expect(samples[1].timestamp).toBe(1700000005000);
});
it("excludes stale values and rejects a derived power from widely separated reads", () => {
  const samples = reconstructHistory(
    [
      reading("voltage", 405, 0),
      reading("current", 2, 20000),
      reading("soc", 90, 60000),
    ],
    "diagnostic",
  );
  expect(samples[1].values.power).toBeNull();
  expect(samples[2].values.voltage).toBeNull();
  expect(samples[2].values.soc).toBe(90);
});

it("keeps group identities separate, requires four fields and expires old groups", () => {
  const rows = [
    { ...reading("module_min_voltage", 3.319, 0), module_id: 2 },
    { ...reading("module_max_voltage", 3.321, 1000), module_id: 2 },
    { ...reading("module_temperature_a", 23, 2000), module_id: 2 },
    { ...reading("module_temperature_b", 22, 3000), module_id: 2 },
    { ...reading("module_min_voltage", 3.32, 4000), module_id: 1 },
    reading("soc", 90, 125000),
  ];
  const samples = reconstructHistory(rows, "replay");
  expect(samples[2].modules).toEqual([]);
  expect(samples[3].modules[0]).toMatchObject({
    id: 2,
    minVoltage: 3.319,
    maxVoltage: 3.321,
    minTemperature: 23,
    maxTemperature: 22,
  });
  expect(samples[4].modules.map((m) => m.id)).toEqual([2]);
  expect(samples[5].modules).toEqual([]);
  expect(samples[3].values.voltage).toBeNull();
});
