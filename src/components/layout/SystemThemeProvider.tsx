"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  PlatformBrandProvider,
  usePlatformBrand,
} from "@/components/layout/PlatformBrandContext";
import {
  DEFAULT_SYSTEM_UI,
  type SystemUiTheme,
} from "@/lib/system-ui";

function ThemeCssAndFavicon({ children }: { children: ReactNode }) {
  const theme = usePlatformBrand();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", theme.primary);
    root.style.setProperty("--brand-secondary", theme.secondary);
    root.style.setProperty("--brand-tertiary", theme.tertiary);
    root.style.setProperty("--surface-0", theme.background);
    root.style.setProperty("--ink", theme.ink);
    root.style.setProperty("--brand-font", theme.fontFamily);
  }, [theme]);

  useEffect(() => {
    if (!theme.faviconUrl) return;
    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]',
    );
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = theme.faviconUrl;
      document.head.appendChild(link);
      return;
    }
    for (const link of links) {
      link.href = theme.faviconUrl;
    }
  }, [theme.faviconUrl]);

  return <>{children}</>;
}

function mergeTheme(partial: Partial<SystemUiTheme> | undefined): SystemUiTheme {
  if (!partial) return DEFAULT_SYSTEM_UI;
  return {
    primary: partial.primary || DEFAULT_SYSTEM_UI.primary,
    secondary: partial.secondary || DEFAULT_SYSTEM_UI.secondary,
    tertiary: partial.tertiary || DEFAULT_SYSTEM_UI.tertiary,
    background: partial.background || DEFAULT_SYSTEM_UI.background,
    ink: partial.ink || DEFAULT_SYSTEM_UI.ink,
    wordmark: partial.wordmark || DEFAULT_SYSTEM_UI.wordmark,
    logoUrl: partial.logoUrl ?? DEFAULT_SYSTEM_UI.logoUrl,
    faviconUrl: partial.faviconUrl ?? DEFAULT_SYSTEM_UI.faviconUrl,
    fontFamily: partial.fontFamily || DEFAULT_SYSTEM_UI.fontFamily,
  };
}

export function SystemThemeProvider({
  theme: initialTheme,
  children,
}: {
  theme: SystemUiTheme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<SystemUiTheme>(initialTheme);

  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/theme", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { theme?: Partial<SystemUiTheme> }) => {
        if (cancelled || !data.theme) return;
        setTheme(mergeTheme(data.theme));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PlatformBrandProvider theme={theme}>
      <ThemeCssAndFavicon>{children}</ThemeCssAndFavicon>
    </PlatformBrandProvider>
  );
}
