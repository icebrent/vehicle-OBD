export interface CANFrame {
  timestamp_utc: string;
  timestamp_monotonic: number;
  session_id: string;
  adapter_id: string;
  channel: string;
  arbitration_id: number;
  is_extended_id: boolean;
  is_remote_frame: boolean;
  dlc: number;
  data: string;
  raw_line: string;
  timestamp_source: "pc_receive" | "simulation" | "device";
  is_simulated: boolean;
  is_fd: false;
  origin_session_id: string | null;
}
export interface Config {
  kind: "obdlink" | "replay";
  port?: string;
  monitor_strategy: "sampled_16";
  monitor_interval_seconds: number;
  serial_baudrate: number;
  can_bitrate: number;
  channel: "can0";
  replay_session_id?: string;
  replay_speed: number;
}
export interface PIDReport {
  timestamp_utc: string;
  outcome: "responded" | "no_response";
  support: { ecu_id: string; pids: string[] }[];
  values: {
    ecu_id: string;
    pid: string;
    name: string;
    value: number;
    unit: string;
    timestamp_utc: string;
  }[];
  requests_sent: string[];
  notes: string[];
}
export interface Stats {
  received_frames: number;
  parsed_frames: number;
  received_bytes: number;
  parse_errors: number;
  buffer_overflows: number;
  queue_drops: number;
  ws_drops: number;
  analysis_evictions: number;
  storage_errors: number;
  fps: number;
  active_ids: number;
}
export interface Status {
  state: "disconnected" | "connected" | "listening" | "querying" | "error";
  config: Config;
  capture_session_id: string | null;
  recording_id: string | null;
  session_name: string;
  profile_id: string;
  hardware_enabled: boolean;
  last_error: string | null;
  stats: Stats;
}
export interface Row {
  key: string;
  frame: CANFrame;
  count: number;
  hz: number;
  changed_at: number[];
}
export interface Snapshot {
  type: "snapshot";
  sequence: number;
  status: Status;
  rows: Row[];
  frames: CANFrame[];
}
export interface Session {
  id: string;
  name: string;
  notes: string;
  started_at: string;
  ended_at: string | null;
  source: string;
  profile_id: string;
  frame_count: number;
  status: string;
  quality: string;
}
export interface Diagnostic {
  timestamp: string;
  level: string;
  message: string;
}
export interface Point {
  t: number;
  bytes: (number | null)[];
}
