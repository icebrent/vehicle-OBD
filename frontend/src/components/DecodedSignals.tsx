import { useEffect, useState } from "react";
import { api } from "../api";
import { useMonitor } from "../state/store";
import type { PIDReport } from "../types";

export function DecodedSignals() {
  const { status } = useMonitor();
  const [report, setReport] = useState<PIDReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<PIDReport | null>("/obd/report")
      .then(setReport)
      .catch(() => {});
  }, []);
  async function probe() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(await api<PIDReport>("/obd/probe", {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel decoded-signals" aria-label="Decoded signals">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PHYSICAL VALUES</span>
          <h2>Decoded signals</h2>
        </div>
        <button
          onClick={probe}
          disabled={
            busy ||
            status?.state !== "connected" ||
            status.config.kind !== "obdlink" ||
            !!status.recording_id
          }
        >
          {busy || status?.state === "querying"
            ? "Reading PIDs…"
            : "Read standard PIDs once"}
        </button>
      </div>
      <p>
        No verified passive signal definitions. For an explicit, active read
        test, stop capture first and keep MX+ connected. At least 2 seconds
        between requests, at most 10 requests; no automatic polling or OEM
        requests.
      </p>
      {error && <p role="alert">{error}</p>}
      {report && (
        <div className="pid-results">
          <p>
            One-shot snapshot ·{" "}
            {new Date(report.timestamp_utc).toLocaleString("en-US")} · Not live
            · Not saved
          </p>
          {report.outcome === "no_response" && (
            <p>No standard PID response. Vehicle support is still unknown.</p>
          )}
          {report.support.map((ecu) => (
            <p key={ecu.ecu_id}>
              ECU {ecu.ecu_id} · Supported:{" "}
              {ecu.pids.join(", ") || "None reported"}
            </p>
          ))}
          {report.values.map((v) => (
            <p key={`${v.ecu_id}-${v.pid}`}>
              <strong>
                {v.name}: {v.value.toLocaleString("en-US")} {v.unit}
              </strong>{" "}
              · {v.pid} / ECU {v.ecu_id}
            </p>
          ))}
          <p>Requests sent: {report.requests_sent.join(", ")}</p>
        </div>
      )}
    </section>
  );
}
