import { getAppSettings } from "@/lib/app-settings";

export type SystemUiTheme = {
  primary: string;
  secondary: string;
  tertiary: string;
  background: string;
  ink: string;
  wordmark: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  fontFamily: string;
};

export const DEFAULT_SYSTEM_UI: SystemUiTheme = {
  primary: "#0ea5e9",
  secondary: "#38bdf8",
  tertiary: "#818cf8",
  background: "#0b1020",
  ink: "#f8fafc",
  wordmark: "OpenMeet",
  logoUrl: null,
  faviconUrl: null,
  fontFamily: "Inter, system-ui, sans-serif",
};

export async function resolveSystemUiTheme(): Promise<SystemUiTheme> {
  const row = await getAppSettings();
  if (!row) return DEFAULT_SYSTEM_UI;
  return {
    primary: row.uiPrimary || DEFAULT_SYSTEM_UI.primary,
    secondary: row.uiSecondary || DEFAULT_SYSTEM_UI.secondary,
    tertiary: row.uiTertiary || DEFAULT_SYSTEM_UI.tertiary,
    background: row.uiBackground || DEFAULT_SYSTEM_UI.background,
    ink: row.uiInk || DEFAULT_SYSTEM_UI.ink,
    wordmark: row.uiWordmark || DEFAULT_SYSTEM_UI.wordmark,
    logoUrl: row.uiLogoUrl || null,
    faviconUrl: row.uiFaviconUrl || null,
    fontFamily: row.uiFontFamily || DEFAULT_SYSTEM_UI.fontFamily,
  };
}

export function systemUiToCssVars(theme: SystemUiTheme): Record<string, string> {
  return {
    "--brand-primary": theme.primary,
    "--brand-secondary": theme.secondary,
    "--brand-tertiary": theme.tertiary,
    "--surface-0": theme.background,
    "--ink": theme.ink,
    "--brand-font": theme.fontFamily,
  };
}
