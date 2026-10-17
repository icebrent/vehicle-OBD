import type { VehicleSample } from "../src/vehicle/signals";
export type Scenario = "idle" | "driving" | "regen";
export const MAX_SAMPLES = 360;
export class MockVehicleSource {
  readonly kind = "mock" as const;
  scenario: Scenario = "idle";
  sample(timestamp: number): Omit<VehicleSample, "source"> & {
    source: "mock";
    values: Record<import("../src/vehicle/signals").SignalId, number>;
  } {
    const t = timestamp / 1000;
    const current =
      this.scenario === "driving"
        ? 38 + 19 * Math.sin(t / 6)
        : this.scenario === "regen"
          ? -24 + 9 * Math.sin(t / 5)
          : 1.8 + 0.7 * Math.sin(t / 7);
    const voltage = 405 + 0.8 * Math.sin(t / 19) - current * 0.018;
    return {
      timestamp,
      source: "mock",
      values: {
        soc: 90 + 0.2 * Math.sin(t / 110),
        voltage,
        current,
        power: (voltage * current) / 1000,
        temperature: 22 + 0.5 * Math.sin(t / 21),
        capacity: 150,
        chargeCount: 446,
        chargedEnergy: 5583.2,
        dischargedEnergy: 5592.4,
      },
      modules: Array.from({ length: 10 }, (_, index) => {
        const minVoltage = 3.318 + 0.002 * Math.sin(t / 23 + index);
        const minTemperature = 22 + 0.45 * Math.sin(t / 25 + index / 3);
        return {
          id: index + 1,
          minVoltage,
          maxVoltage: minVoltage + 0.003 + index * 0.0003,
          minTemperature,
          maxTemperature: minTemperature + 0.8,
        };
      }),
    };
  }
}
