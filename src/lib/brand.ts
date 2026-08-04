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

export type PaintStop = { color: string; at: number };

export type PaintGradient = {
  type: "linear" | "radial";
  angle: number;
  stops: PaintStop[];
};

export type PaintToken = {
  mode: "solid" | "gradient";
  solid: string;
  gradient?: PaintGradient;
};

export type PatternSizeMode = "percent" | "fixed";
export type PatternTint = "none" | "primary" | "secondary" | "tertiary" | "custom";
export type BgAnimation = "none" | "wave" | "beam" | "aurora" | "pulse";

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
  primaryPaint?: PaintToken | null;
  secondaryPaint?: PaintToken | null;
  tertiaryPaint?: PaintToken | null;
  backgroundPaint?: PaintToken | null;
  patternUrl?: string | null;
  patternSizeMode?: PatternSizeMode | null;
  patternSize?: number | null;
  patternTint?: PatternTint | null;
  patternTintColor?: string | null;
  patternTintOpacity?: number | null;
  bgAnimation?: BgAnimation | null;
  bgAnimationSpeed?: number | null;
};

export function solidPaint(color: string): PaintToken {
  return { mode: "solid", solid: color };
}

export function resolvePaint(
  paint: PaintToken | null | undefined,
  fallbackSolid: string,
): PaintToken {
  if (!paint || !paint.solid) {
    return solidPaint(fallbackSolid);
  }
  const gradient = paint.gradient;
  if (paint.mode === "gradient" && gradient && gradient.stops.length >= 2) {
    return {
      mode: "gradient",
      solid: paint.solid || gradient.stops[0].color,
      gradient: {
        type: gradient.type === "radial" ? "radial" : "linear",
        angle: Number.isFinite(gradient.angle) ? gradient.angle : 135,
        stops: gradient.stops.map((s) => ({
          color: s.color,
          at: Math.min(100, Math.max(0, s.at)),
        })),
      },
    };
  }
  return solidPaint(paint.solid || fallbackSolid);
}

export function paintToCss(paint: PaintToken): string {
  if (paint.mode !== "gradient" || !paint.gradient || paint.gradient.stops.length < 2) {
    return paint.solid;
  }
  const stops = paint.gradient.stops
    .map((s) => `${s.color} ${s.at}%`)
    .join(", ");
  if (paint.gradient.type === "radial") {
    return `radial-gradient(circle at center, ${stops})`;
  }
  return `linear-gradient(${paint.gradient.angle}deg, ${stops})`;
}

export function defaultGradientFromSolid(
  solid: string,
  second = "#22d3ee",
): PaintToken {
  return {
    mode: "gradient",
    solid,
    gradient: {
      type: "linear",
      angle: 135,
      stops: [
        { color: solid, at: 0 },
        { color: second, at: 100 },
      ],
    },
  };
}

function animationDurationSeconds(speed: number | null | undefined): number {
  const s = Math.min(10, Math.max(1, speed ?? 3));
  // speed 1 = slowest (~48s), speed 10 = fastest (~8s)
  return 52 - s * 4.4;
}

function resolveTintColor(
  brand: BrandTokens,
  primary: string,
  secondary: string,
  tertiary: string,
): string {
  const tint = brand.patternTint || "none";
  if (tint === "none") return "transparent";
  if (tint === "primary") return primary;
  if (tint === "secondary") return secondary;
  if (tint === "tertiary") return tertiary;
  return brand.patternTintColor || primary;
}

function patternSizeCss(brand: BrandTokens): string {
  const mode = brand.patternSizeMode === "fixed" ? "fixed" : "percent";
  const size =
    typeof brand.patternSize === "number" && Number.isFinite(brand.patternSize)
      ? brand.patternSize
      : mode === "fixed"
        ? 128
        : 24;
  if (mode === "fixed") {
    return `${Math.min(512, Math.max(16, size))}px`;
  }
  return `${Math.min(100, Math.max(1, size))}%`;
}

export function brandToCssVars(brand: BrandTokens): Record<string, string> {
  const preset = BOARD_THEMES[brand.themePreset || "indigo"] || BOARD_THEMES.indigo;
  const primarySolid = brand.primaryColor || preset.primary;
  const secondarySolid = brand.secondaryColor || preset.secondary;
  const tertiarySolid = brand.tertiaryColor || preset.tertiary;
  const bgSolid = brand.background || "#0b1020";

  const primaryPaint = resolvePaint(brand.primaryPaint, primarySolid);
  const secondaryPaint = resolvePaint(brand.secondaryPaint, secondarySolid);
  const tertiaryPaint = resolvePaint(brand.tertiaryPaint, tertiarySolid);
  const backgroundPaint = resolvePaint(brand.backgroundPaint, bgSolid);

  const tintColor = resolveTintColor(
    brand,
    primaryPaint.solid,
    secondaryPaint.solid,
    tertiaryPaint.solid,
  );
  const tintOpacity =
    brand.patternTint && brand.patternTint !== "none"
      ? Math.min(100, Math.max(0, brand.patternTintOpacity ?? 55)) / 100
      : 0;

  const animation = brand.bgAnimation || "none";
  const duration = animationDurationSeconds(brand.bgAnimationSpeed);

  return {
    "--brand-primary": primaryPaint.solid,
    "--brand-secondary": secondaryPaint.solid,
    "--brand-tertiary": tertiaryPaint.solid,
    "--brand-primary-paint": paintToCss(primaryPaint),
    "--brand-secondary-paint": paintToCss(secondaryPaint),
    "--brand-tertiary-paint": paintToCss(tertiaryPaint),
    "--brand-font": brand.fontFamily || "Inter, system-ui, sans-serif",
    "--brand-bg": paintToCss(backgroundPaint),
    "--brand-bg-solid": backgroundPaint.solid,
    "--brand-logo-url": brand.logoUrl ? `url("${brand.logoUrl}")` : "none",
    "--brand-pattern-url": brand.patternUrl ? `url("${brand.patternUrl}")` : "none",
    "--brand-pattern-size": patternSizeCss(brand),
    "--brand-pattern-tint": tintColor,
    "--brand-pattern-tint-opacity": String(tintOpacity),
    "--brand-bg-animation": animation,
    "--brand-bg-animation-speed": `${duration}s`,
  };
}

export function brandStyleString(brand: BrandTokens): string {
  return Object.entries(brandToCssVars(brand))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
