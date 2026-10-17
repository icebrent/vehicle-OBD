import { formatSignal } from "./signals";
import type { VehicleSample } from "./signals";
export type VehicleSection = "battery" | "powertrain";
export function VehicleDiagram({
  sample,
  selectedModule,
  onModule,
  onSection,
}: {
  sample: VehicleSample;
  selectedModule: number | null;
  onModule: (id: number) => void;
  onSection: (section: VehicleSection) => void;
}) {
  const v = sample.values;
  const key = (action: () => void) => (e: React.KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
  return (
    <svg
      className="vt-car"
      viewBox="0 0 1000 600"
      role="group"
      aria-label={`Vehicle schematic with ${sample.source} battery readings`}
    >
      <defs>
        <linearGradient id="vt-body" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--vt-car-light)" />
          <stop offset=".5" stopColor="var(--vt-car-dark)" />
          <stop offset="1" stopColor="var(--vt-car-light)" />
        </linearGradient>
        <linearGradient id="vt-glass" x2="0.8" y2="1">
          <stop stopColor="var(--vt-glass)" />
          <stop offset="1" stopColor="var(--vt-bg)" />
        </linearGradient>
        <pattern
          id="vt-grid"
          width="35"
          height="35"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 35 0 L 0 0 0 35"
            fill="none"
            stroke="var(--vt-line)"
            strokeWidth=".5"
          />
        </pattern>
      </defs>
      <rect width="1000" height="600" fill="url(#vt-grid)" opacity=".3" />
      <ellipse cx="500" cy="310" rx="152" ry="269" fill="var(--vt-shadow)" />
      <path d="M500 16v568" className="vt-guide" />
      {[115, 405].flatMap((y, i) => [
        <rect
          key={`l${i}`}
          x="352"
          y={y}
          width="38"
          height="92"
          rx="12"
          className="vt-tire"
        />,
        <rect
          key={`r${i}`}
          x="610"
          y={y}
          width="38"
          height="92"
          rx="12"
          className="vt-tire"
        />,
      ])}
      <path
        d="M420 37 Q500 7 580 37 Q616 66 620 145 L629 433 Q628 528 584 560 Q500 588 416 560 Q372 528 371 433 L380 145 Q384 66 420 37Z"
        fill="url(#vt-body)"
        stroke="var(--vt-car-edge)"
        strokeWidth="2"
      />
      <path
        d="M405 100 Q500 65 595 100 L586 185 Q500 169 414 185Z"
        fill="url(#vt-glass)"
        stroke="var(--vt-car-edge)"
      />
      <path
        d="M416 410 Q500 425 584 410 L593 495 Q500 530 407 495Z"
        fill="url(#vt-glass)"
        stroke="var(--vt-car-edge)"
      />
      <path
        d="M393 214L397 397M607 214L603 397M415 50Q500 27 585 50M418 546Q500 566 582 546"
        fill="none"
        stroke="var(--vt-car-edge)"
        strokeWidth="2"
      />
      <path
        d="M394 70L426 59M606 70L574 59"
        stroke="var(--vt-accent)"
        strokeWidth="4"
        opacity=".7"
      />
      <path
        d="M400 526L427 540M600 526L573 540"
        stroke="#d98c91"
        strokeWidth="3"
      />
      <g
        role="button"
        tabIndex={0}
        aria-label="Inspect front powertrain"
        onClick={() => onSection("powertrain")}
        onKeyDown={key(() => onSection("powertrain"))}
        className="vt-svg-hotspot"
      >
        <rect
          x="424"
          y="155"
          width="152"
          height="42"
          rx="9"
          className="vt-motor"
        />
        <path
          d="M390 176H424M576 176H610"
          stroke="var(--vt-muted)"
          strokeWidth="5"
        />
        <text x="500" y="181" textAnchor="middle" className="vt-svg-small">
          FRONT POWERTRAIN
        </text>
      </g>
      <rect
        x="410"
        y="211"
        width="180"
        height="209"
        rx="10"
        className="vt-pack"
      />
      {sample.modules.map((m) => {
        const i = m.id - 1;
        const x = 420 + (i % 2) * 82,
          y = 221 + Math.floor(i / 2) * 38;
        return (
          <g
            key={m.id}
            role="button"
            tabIndex={0}
            aria-label={`Inspect illustrative module ${m.id}`}
            onClick={() => onModule(m.id)}
            onKeyDown={key(() => onModule(m.id))}
            className="vt-svg-hotspot"
          >
            <rect
              x={x}
              y={y}
              width="77"
              height="33"
              rx="4"
              className={`vt-module ${selectedModule === m.id ? "selected" : ""}`}
              style={{
                fillOpacity: Math.max(
                  0.1,
                  Math.min(
                    0.9,
                    0.1 +
                      (Math.max(m.minTemperature, m.maxTemperature) - 21) * 0.1,
                  ),
                ),
              }}
            />
            <text x={x + 9} y={y + 13} className="vt-module-id">
              M{String(m.id).padStart(2, "0")}
            </text>
            <text
              x={x + 68}
              y={y + 25}
              textAnchor="end"
              className="vt-module-temp"
            >
              {Math.max(m.minTemperature, m.maxTemperature).toFixed(1)}°
            </text>
          </g>
        );
      })}
      <path d="M500 198V211M500 420V444" className="vt-hv-wire" />
      <g className="vt-callout">
        <path d="M425 176H313L283 137H64" />
        <circle cx="425" cy="176" r="3" />
        <text x="64" y="91" className="vt-svg-label">
          DRIVE UNIT
        </text>
        <text x="64" y="122" className="vt-svg-value">
          — <tspan className="vt-svg-unit">rpm / Nm</tspan>
        </text>
        <text x="64" y="157" className="vt-svg-small">
          No mapped motor signals
        </text>
      </g>
      <g className="vt-callout">
        <path d="M410 285H310L280 280H64" />
        <circle cx="410" cy="285" r="3" />
        <text x="64" y="234" className="vt-svg-label">
          PACK VOLTAGE
        </text>
        <text x="64" y="267" className="vt-svg-value">
          {formatSignal("voltage", v.voltage)}{" "}
          <tspan className="vt-svg-unit">V</tspan>
        </text>
      </g>
      <g className="vt-callout">
        <path d="M410 386H310L280 443H64" />
        <circle cx="410" cy="386" r="3" />
        <text x="64" y="397" className="vt-svg-label">
          BATTERY TEMPERATURE
        </text>
        <text x="64" y="430" className="vt-svg-value">
          {formatSignal("temperature", v.temperature)}{" "}
          <tspan className="vt-svg-unit">°C</tspan>
        </text>
      </g>
      <g className="vt-callout">
        <path d="M590 245H687L716 137H940" />
        <circle cx="590" cy="245" r="3" />
        <text x="746" y="91" className="vt-svg-label">
          STATE OF CHARGE
        </text>
        <text x="746" y="122" className="vt-svg-value">
          {formatSignal("soc", v.soc)} <tspan className="vt-svg-unit">%</tspan>
        </text>
      </g>
      <g className="vt-callout">
        <path d="M590 315H685L715 280H940" />
        <circle cx="590" cy="315" r="3" />
        <text x="746" y="234" className="vt-svg-label">
          PACK CURRENT
        </text>
        <text x="746" y="267" className="vt-svg-value">
          {formatSignal("current", v.current)}{" "}
          <tspan className="vt-svg-unit">A</tspan>
        </text>
      </g>
      <g className="vt-callout">
        <path d="M590 387H687L716 443H940" />
        <circle cx="590" cy="387" r="3" />
        <text x="746" y="397" className="vt-svg-label">
          BATTERY POWER · DERIVED
        </text>
        <text x="746" y="430" className="vt-svg-value">
          {formatSignal("power", v.power)}{" "}
          <tspan className="vt-svg-unit">kW</tspan>
        </text>
      </g>
      <text x="500" y="595" textAnchor="middle" className="vt-svg-small">
        SCHEMATIC ONLY · MODULE POSITIONS UNVERIFIED
      </text>
    </svg>
  );
}
