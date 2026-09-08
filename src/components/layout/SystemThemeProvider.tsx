"use client";

import { useEffect } from "react";
import {
  PlatformBrandProvider,
  usePlatformBrand,
} from "@/components/layout/PlatformBrandContext";
import type { SystemUiTheme } from "@/lib/system-theme";

function ThemeCssAndFavicon({ children }: { children: React.ReactNode }) {
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

export function SystemThemeProvider({
  theme,
  children,
}: {
  theme: SystemUiTheme;
  children: React.ReactNode;
}) {
  return (
    <PlatformBrandProvider theme={theme}>
      <ThemeCssAndFavicon>{children}</ThemeCssAndFavicon>
    </PlatformBrandProvider>
  );
}
