import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ModuleReading, SignalId, VehicleSample } from "./signals";

export interface DIDReading {
  timestamp_utc: string;
  timestamp_monotonic: number;
  signal_id:
    | "soc"
    | "voltage"
    | "current"
    | "temperature"
    | "module_min_voltage"
    | "module_max_voltage"
    | "module_temperature_a"
    | "module_temperature_b";
  module_id?: number | null;
  value: number;
  unit: string;
  raw_response: string;
  request: string;
  validation: "experimental";
}
export function moduleReadings(
  readings: DIDReading[],
  now: number,
): ModuleReading[] {
  const fields = [
    "module_min_voltage",
    "module_max_voltage",
    "module_temperature_a",
    "module_temperature_b",
  ] as const;
  const groups = new Map<number, Map<string, DIDReading>>();
  for (const reading of readings) {
    if (!reading.module_id) continue;
    const group =
      groups.get(reading.module_id) ?? new Map<string, DIDReading>();
    group.set(reading.signal_id, reading);
    groups.set(reading.module_id, group);
  }
  const result: ModuleReading[] = [];
  for (const [id, group] of groups) {
    const rows = fields.map((field) => group.get(field));
    if (
      rows.some((row) => !row || now - Date.parse(row.timestamp_utc) > 120000)
    )
      continue;
    result.push({
      id,
      minVoltage: rows[0]!.value,
      maxVoltage: rows[1]!.value,
      minTemperature: rows[2]!.value,
      maxTemperature: rows[3]!.value,
      timestamp: Math.min(...rows.map((row) => Date.parse(row!.timestamp_utc))),
    });
  }
  return result.sort((a, b) => a.id - b.id);
}
export interface DIDState {
  state:
    | "idle"
    | "starting"
    | "live"
    | "stopped"
    | "error"
    | "replaying"
    | "complete";
  source: "diagnostic" | "replay";
  last_error: string | null;
  recording_id: string | null;
  saving_armed: boolean;
  received: number;
  latest: DIDReading[];
  history: DIDReading[];
}
export const emptyValues = (): Record<SignalId, number | null> => ({
  soc: null,
  voltage: null,
  current: null,
  power: null,
  temperature: null,
  capacity: null,
  chargeCount: null,
  chargedEnergy: null,
  dischargedEnergy: null,
});
export function reconstructHistory(
  readings: DIDReading[],
  source: "diagnostic" | "replay",
): VehicleSample[] {
  const values = emptyValues();
  const timestamps: Partial<Record<SignalId, number>> = {};
  const modules = new Map<string, DIDReading>();
  return readings.map((reading) => {
    const timestamp = Date.parse(reading.timestamp_utc);
    if (reading.module_id)
      modules.set(`${reading.module_id}:${reading.signal_id}`, reading);
    else if (reading.signal_id in values) {
      values[reading.signal_id as SignalId] = reading.value;
      timestamps[reading.signal_id as SignalId] = timestamp;
    }
    const currentValues = { ...values };
    for (const key of Object.keys(timestamps) as SignalId[])
      if (timestamp - timestamps[key]! > 45000) currentValues[key] = null;
    if (
      currentValues.voltage !== null &&
      currentValues.current !== null &&
      Math.abs(timestamps.voltage! - timestamps.current!) <= 15000
    )
      currentValues.power =
        (currentValues.voltage * currentValues.current) / 1000;
    return {
      timestamp,
      source,
      values: currentValues,
      modules: moduleReadings([...modules.values()], timestamp),
    };
  });
}
export function useDiagnosticVehicle(enabled: boolean) {
  const [status, setStatus] = useState<DIDState | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<VehicleSample[]>([]);
  const [clock, setClock] = useState(Date.now());
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const next = await api<DIDState>("/vehicle/status");
      setStatus(next);
      setError("");
      setClock(Date.now());
      if (!pausedRef.current)
        setHistory(reconstructHistory(next.history, next.source));
    } catch (e) {
      setError((e as Error).message);
      setClock(Date.now());
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let mounted = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!mounted) return;
      await refresh();
      if (mounted) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [enabled, refresh]);
  const latest: VehicleSample = history.length
    ? {
        ...history[history.length - 1],
        values: { ...history[history.length - 1].values },
      }
    : {
        timestamp: clock,
        source: status?.source ?? "diagnostic",
        values: emptyValues(),
        modules: [],
      };
  if (!paused && status?.source !== "replay") {
    latest.modules = moduleReadings(status?.latest ?? [], clock);
    for (const key of ["soc", "voltage", "current", "temperature"] as const) {
      const reading = status?.latest.find((r) => r.signal_id === key);
      if (!reading || clock - Date.parse(reading.timestamp_utc) > 45000)
        latest.values[key] = null;
    }
    if (latest.values.current === null || latest.values.voltage === null)
      latest.values.power = null;
  }
  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (!pausedRef.current && status)
      setHistory(reconstructHistory(status.history, status.source));
  }
  return { history, latest, paused, togglePause, status, error, refresh };
}
