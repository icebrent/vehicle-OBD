export type SignalId =
  | "soc"
  | "voltage"
  | "current"
  | "power"
  | "temperature"
  | "capacity"
  | "chargeCount"
  | "chargedEnergy"
  | "dischargedEnergy";
export interface SignalDefinition {
  id: SignalId;
  name: string;
  unit: string;
  decimals: number;
  color: string;
  request: string;
  evidence: "Log + community" | "Candidate" | "Derived";
  note: string;
}
export const signals: SignalDefinition[] = [
  {
    id: "soc",
    name: "State of charge",
    unit: "%",
    decimals: 1,
    color: "#42cbb2",
    request: "7E7 → 7EF · 22 00 05",
    evidence: "Log + community",
    note: "Positive response in the supplied log. Conversion remains experimental.",
  },
  {
    id: "voltage",
    name: "Pack voltage",
    unit: "V",
    decimals: 1,
    color: "#86a9ff",
    request: "7E7 → 7EF · 22 00 08",
    evidence: "Log + community",
    note: "Candidate conversion: little-endian uint16. Confirm against the reference app.",
  },
  {
    id: "current",
    name: "Pack current",
    unit: "A",
    decimals: 1,
    color: "#e5b67b",
    request: "7E7 → 7EF · 22 00 09",
    evidence: "Log + community",
    note: "Candidate conversion: uint16 LE × 0.1 − 500. Vehicle sign convention unverified.",
  },
  {
    id: "power",
    name: "Battery power",
    unit: "kW",
    decimals: 2,
    color: "#b49aee",
    request: "Voltage × current / 1000",
    evidence: "Derived",
    note: "Voltage × current. Live reads are sequential, not simultaneous; vehicle sign convention is unverified.",
  },
  {
    id: "temperature",
    name: "Battery temperature",
    unit: "°C",
    decimals: 1,
    color: "#e693a1",
    request: "7E7 → 7EF · 22 00 32",
    evidence: "Log + community",
    note: "Candidate conversion: byte − 40. Temperature location is not established.",
  },
  {
    id: "capacity",
    name: "Reported capacity",
    unit: "Ah",
    decimals: 2,
    color: "#77bac6",
    request: "22 1F FE / 22 1F FC",
    evidence: "Candidate",
    note: "Payload fields and capacity meaning require validation. Illustrative value only.",
  },
  {
    id: "chargeCount",
    name: "Charge connection count",
    unit: "count",
    decimals: 0,
    color: "#b7c58b",
    request: "7E7 → 7EF · 22 00 0B",
    evidence: "Candidate",
    note: "Community association; definition and scaling are not validated.",
  },
  {
    id: "chargedEnergy",
    name: "Total charged energy",
    unit: "kWh",
    decimals: 1,
    color: "#8bc9dd",
    request: "7E7 → 7EF · 22 00 11",
    evidence: "Candidate",
    note: "Community association. Unit scaling is unverified; mock number is illustrative.",
  },
  {
    id: "dischargedEnergy",
    name: "Total discharged energy",
    unit: "kWh",
    decimals: 1,
    color: "#c6b894",
    request: "7E7 → 7EF · 22 00 12",
    evidence: "Candidate",
    note: "Community association. Unit scaling is unverified; mock number is illustrative.",
  },
];
export const signalById = Object.fromEntries(
  signals.map((s) => [s.id, s]),
) as Record<SignalId, SignalDefinition>;
export function formatSignal(id: SignalId, value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: signalById[id].decimals,
    maximumFractionDigits: signalById[id].decimals,
  });
}
export interface ModuleReading {
  id: number;
  timestamp?: number;
  minVoltage: number;
  maxVoltage: number;
  minTemperature: number;
  maxTemperature: number;
}
export interface VehicleSample {
  timestamp: number;
  source: "mock" | "diagnostic" | "replay";
  values: Record<SignalId, number | null>;
  modules: ModuleReading[];
}
// Future diagnostic providers must supply timestamp, quality, provenance and stale state;
// never fill missing hardware signals from this mock provider.
export interface TelemetrySource {
  readonly kind: "mock";
  sample(timestamp: number): VehicleSample;
}
