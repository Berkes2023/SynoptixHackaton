"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Mode = "light" | "dark" | "system";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem("dt-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {
      /* storage unavailable */
    }
  }, []);

  function cycle() {
    const next: Mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    try {
      if (next === "system") {
        localStorage.removeItem("dt-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("dt-theme", next);
        document.documentElement.dataset.theme = next;
      }
    } catch {
      if (next !== "system") document.documentElement.dataset.theme = next;
    }
  }

  const label = mode === "system" ? "Theme: system" : mode === "light" ? "Theme: light" : "Theme: dark";
  return (
    <button type="button" onClick={cycle} className={`btn btn-ghost px-2 ${className}`} aria-label={`${label}. Click to change.`} title={label}>
      <Icon name={mode === "dark" ? "moon" : mode === "light" ? "sun" : "monitor"} className="h-4 w-4" />
    </button>
  );
}
