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

/** Client-safe defaults — no DB / Node imports. */
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
