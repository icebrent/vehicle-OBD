import { useEffect, useRef, useState } from "react";
import type { TelemetrySource, VehicleSample } from "./signals";
export type Scenario = "idle" | "driving" | "regen";
export const MAX_SAMPLES = 360;
export class MockVehicleSource implements TelemetrySource {
  readonly kind = "mock" as const;
  scenario: Scenario = "idle";
  sample(
    timestamp: number,
  ): VehicleSample & { values: Record<import("./signals").SignalId, number> } {
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
export function useMockVehicle(enabled = true) {
  const source = useRef(new MockVehicleSource());
  const initial = useRef<VehicleSample[] | null>(null);
  if (!initial.current) {
    const now = Date.now();
    initial.current = Array.from({ length: 121 }, (_, i) =>
      source.current.sample(now - (120 - i) * 500),
    );
  }
  const samples = useRef(initial.current);
  const [history, setHistory] = useState(initial.current);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [scenario, setScenarioState] = useState<Scenario>("idle");
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      samples.current = [
        ...samples.current.slice(-(MAX_SAMPLES - 1)),
        source.current.sample(Date.now()),
      ];
      if (!pausedRef.current) setHistory(samples.current);
    }, 500);
    return () => clearInterval(timer);
  }, [enabled]);
  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (!pausedRef.current) setHistory(samples.current);
  }
  function setScenario(value: Scenario) {
    source.current.scenario = value;
    setScenarioState(value);
  }
  return {
    history,
    latest: history[history.length - 1],
    paused,
    togglePause,
    scenario,
    setScenario,
  };
}
