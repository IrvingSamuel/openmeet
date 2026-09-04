"use client";

import { useEffect } from "react";

type Theme = {
  primary: string;
  secondary: string;
  tertiary: string;
  background: string;
  ink: string;
  fontFamily: string;
};

export function SystemThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/theme")
      .then((r) => r.json())
      .then((data: { theme?: Theme }) => {
        if (cancelled || !data.theme) return;
        const root = document.documentElement;
        const t = data.theme;
        root.style.setProperty("--brand-primary", t.primary);
        root.style.setProperty("--brand-secondary", t.secondary);
        root.style.setProperty("--brand-tertiary", t.tertiary);
        root.style.setProperty("--surface-0", t.background);
        root.style.setProperty("--ink", t.ink);
        root.style.setProperty("--brand-font", t.fontFamily);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
