import { describe, expect, it } from "vitest";
import { MockVehicleSource } from "./mock";

describe("physical mock provider", () => {
  it("keeps derived power consistent and preserves signed regeneration", () => {
    const provider = new MockVehicleSource();
    for (const scenario of ["idle", "driving", "regen"] as const) {
      provider.scenario = scenario;
      const sample = provider.sample(1700000000000);
      expect(sample.source).toBe("mock");
      expect(sample.values.power).toBeCloseTo(
        (sample.values.voltage * sample.values.current) / 1000,
        10,
      );
      expect(sample.values.current < 0).toBe(scenario === "regen");
      expect(sample.modules).toHaveLength(10);
      for (const module of sample.modules) {
        expect(module.minVoltage).toBeLessThan(module.maxVoltage);
        expect(module.minTemperature).toBeLessThan(module.maxTemperature);
      }
    }
  });
});
