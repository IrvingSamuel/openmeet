import { describe, expect, it } from "vitest";
import {
  BOARD_THEMES,
  brandStyleString,
  brandToCssVars,
  defaultGradientFromSolid,
  paintToCss,
  resolvePaint,
  solidPaint,
} from "@/lib/brand";

describe("brandToCssVars", () => {
  it("falls back to the violet preset when nothing is set", () => {
    const vars = brandToCssVars({});
    expect(vars["--brand-primary"]).toBe(BOARD_THEMES.violet.primary);
    expect(vars["--brand-secondary"]).toBe(BOARD_THEMES.violet.secondary);
    expect(vars["--brand-logo-url"]).toBe("none");
    expect(vars["--brand-primary-paint"]).toBe(BOARD_THEMES.violet.primary);
    expect(vars["--brand-pattern-url"]).toBe("none");
    expect(vars["--brand-bg-animation"]).toBe("none");
  });

  it("resolves colors from a named preset", () => {
    const vars = brandToCssVars({ themePreset: "emerald" });
    expect(vars["--brand-primary"]).toBe(BOARD_THEMES.emerald.primary);
  });

  it("ignores an unknown preset instead of emitting undefined", () => {
    const vars = brandToCssVars({ themePreset: "does-not-exist" });
    expect(vars["--brand-primary"]).toBe(BOARD_THEMES.violet.primary);
  });

  it("lets explicit colors win over the preset", () => {
    const vars = brandToCssVars({
      themePreset: "emerald",
      primaryColor: "#ff0000",
    });
    expect(vars["--brand-primary"]).toBe("#ff0000");
    expect(vars["--brand-secondary"]).toBe(BOARD_THEMES.emerald.secondary);
  });

  it("wraps the logo in a css url()", () => {
    const vars = brandToCssVars({ logoUrl: "https://cdn.test/logo.svg" });
    expect(vars["--brand-logo-url"]).toBe('url("https://cdn.test/logo.svg")');
  });

  it("emits gradient paints and keeps solid for color tokens", () => {
    const paint = defaultGradientFromSolid("#111111", "#222222");
    const vars = brandToCssVars({
      primaryColor: "#111111",
      primaryPaint: paint,
      background: "#010101",
      backgroundPaint: paint,
    });
    expect(vars["--brand-primary"]).toBe("#111111");
    expect(vars["--brand-primary-paint"]).toContain("linear-gradient");
    expect(vars["--brand-bg"]).toContain("linear-gradient");
    expect(vars["--brand-bg-solid"]).toBe("#111111");
  });

  it("emits pattern and animation vars", () => {
    const vars = brandToCssVars({
      patternUrl: "/brand-assets/x/pattern.png",
      patternSizeMode: "fixed",
      patternSize: 64,
      patternTint: "primary",
      patternTintOpacity: 40,
      bgAnimation: "wave",
      bgAnimationSpeed: 2,
      primaryColor: "#8b5cf6",
    });
    expect(vars["--brand-pattern-url"]).toBe('url("/brand-assets/x/pattern.png")');
    expect(vars["--brand-pattern-size"]).toBe("64px");
    expect(vars["--brand-pattern-tint"]).toBe("#8b5cf6");
    expect(vars["--brand-pattern-tint-opacity"]).toBe("0.4");
    expect(vars["--brand-bg-animation"]).toBe("wave");
    expect(vars["--brand-bg-animation-speed"]).toMatch(/s$/);
  });
});

describe("paint helpers", () => {
  it("resolvePaint falls back to solid hex for legacy brands", () => {
    expect(resolvePaint(null, "#abcabc")).toEqual(solidPaint("#abcabc"));
  });

  it("paintToCss renders radial and linear gradients", () => {
    const linear = defaultGradientFromSolid("#000000", "#ffffff");
    expect(paintToCss(linear)).toMatch(/^linear-gradient/);
    const radial = {
      ...linear,
      gradient: { ...linear.gradient!, type: "radial" as const },
    };
    expect(paintToCss(radial)).toMatch(/^radial-gradient/);
  });
});

describe("brandStyleString", () => {
  it("serializes every variable as a css declaration list", () => {
    const style = brandStyleString({ primaryColor: "#123456" });
    expect(style).toContain("--brand-primary:#123456");
    expect(style.split(";").length).toBe(
      Object.keys(brandToCssVars({})).length,
    );
  });
});

describe("BOARD_THEMES", () => {
  it("exposes valid hex colors for every preset", () => {
    for (const [key, theme] of Object.entries(BOARD_THEMES)) {
      for (const color of [theme.primary, theme.secondary, theme.tertiary]) {
        expect(color, `${key} → ${color}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(theme.label.length).toBeGreaterThan(0);
    }
  });
});
