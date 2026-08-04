import { describe, expect, it } from "vitest";
import { BOARD_THEMES, brandStyleString, brandToCssVars } from "@/lib/brand";

describe("brandToCssVars", () => {
  it("falls back to the indigo preset when nothing is set", () => {
    const vars = brandToCssVars({});
    expect(vars["--brand-primary"]).toBe(BOARD_THEMES.indigo.primary);
    expect(vars["--brand-secondary"]).toBe(BOARD_THEMES.indigo.secondary);
    expect(vars["--brand-logo-url"]).toBe("none");
  });

  it("resolves colors from a named preset", () => {
    const vars = brandToCssVars({ themePreset: "emerald" });
    expect(vars["--brand-primary"]).toBe(BOARD_THEMES.emerald.primary);
  });

  it("ignores an unknown preset instead of emitting undefined", () => {
    const vars = brandToCssVars({ themePreset: "does-not-exist" });
    expect(vars["--brand-primary"]).toBe(BOARD_THEMES.indigo.primary);
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
    expect(vars["--brand-logo-url"]).toBe("url(https://cdn.test/logo.svg)");
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
