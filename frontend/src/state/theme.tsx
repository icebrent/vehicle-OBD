import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
type Theme = "light" | "dark";
const storageKey = "can-observatory-theme";
const ThemeContext = createContext<{
  preference: ThemePreference;
  resolved: Theme;
  cycle: () => void;
}>({ preference: "system", resolved: "dark", cycle: () => {} });

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Browser storage may be unavailable. */
  }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolved: Theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemDark(media.matches);
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "dark" ? "#0b1118" : "#f3f6fa");
    try {
      if (preference === "system") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, preference);
    } catch {
      /* Switching still works without persistence. */
    }
  }, [preference, resolved]);
  const cycle = () =>
    setPreference((value) =>
      value === "system" ? "light" : value === "light" ? "dark" : "system",
    );
  return (
    <ThemeContext.Provider value={{ preference, resolved, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
