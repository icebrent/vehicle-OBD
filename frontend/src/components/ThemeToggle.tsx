import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../state/theme";

export function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const Icon =
    preference === "system" ? Monitor : preference === "light" ? Sun : Moon;
  const next =
    preference === "system"
      ? "light"
      : preference === "light"
        ? "dark"
        : "system";
  const label = `Theme: ${preference}. Switch to ${next}`;
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
