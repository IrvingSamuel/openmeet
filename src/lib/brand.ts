export const BOARD_THEMES: Record<
  string,
  { label: string; primary: string; secondary: string; tertiary: string }
> = {
  indigo: {
    label: "Indigo (padrão)",
    primary: "#6366f1",
    secondary: "#22d3ee",
    tertiary: "#a855f7",
  },
  emerald: {
    label: "Emerald",
    primary: "#10b981",
    secondary: "#22c55e",
    tertiary: "#14b8a6",
  },
  rose: {
    label: "Rose",
    primary: "#f43f5e",
    secondary: "#fb7185",
    tertiary: "#ec4899",
  },
  amber: {
    label: "Amber",
    primary: "#f59e0b",
    secondary: "#f97316",
    tertiary: "#eab308",
  },
  sky: {
    label: "Sky",
    primary: "#0ea5e9",
    secondary: "#38bdf8",
    tertiary: "#818cf8",
  },
  violet: {
    label: "Violet",
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    tertiary: "#d946ef",
  },
};

export type BrandTokens = {
  logoUrl?: string | null;
  wordmark?: string | null;
  themePreset?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  fontFamily?: string | null;
  background?: string | null;
  lobbyTitle?: string | null;
  lobbySubtitle?: string | null;
  faviconUrl?: string | null;
};

export function brandToCssVars(brand: BrandTokens): Record<string, string> {
  const preset = BOARD_THEMES[brand.themePreset || "indigo"] || BOARD_THEMES.indigo;
  return {
    "--brand-primary": brand.primaryColor || preset.primary,
    "--brand-secondary": brand.secondaryColor || preset.secondary,
    "--brand-tertiary": brand.tertiaryColor || preset.tertiary,
    "--brand-font": brand.fontFamily || "Inter, system-ui, sans-serif",
    "--brand-bg": brand.background || "#0b1020",
    "--brand-logo-url": brand.logoUrl ? `url(${brand.logoUrl})` : "none",
  };
}

export function brandStyleString(brand: BrandTokens): string {
  return Object.entries(brandToCssVars(brand))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
