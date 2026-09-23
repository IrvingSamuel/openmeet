// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  brandGroupsToFields,
  resolveApiBrandUi,
} from "@/lib/api-brand";

describe("brandGroupsToFields", () => {
  it("returns undefined when no groups", () => {
    expect(brandGroupsToFields({})).toBeUndefined();
  });

  it("maps identity/palette/advanced snake_case to camelCase", () => {
    const fields = brandGroupsToFields({
      identity: {
        lobby_title: "Acme",
        lobby_subtitle: "Hello",
        logo_url: "https://cdn.example.com/logo.png",
        wordmark: "Acme Co",
      },
      palette: {
        theme_preset: "emerald",
        primary_color: "#10b981",
        bg_animation: "wave",
        bg_animation_speed: 4,
        pattern_size_mode: "percent",
        pattern_size: 32,
        pattern_tint: "primary",
        pattern_tint_opacity: 60,
      },
      advanced: {
        font_family: "Inter, system-ui, sans-serif",
        custom_css: ".x { color: red }",
      },
    });
    expect(fields).toEqual({
      lobbyTitle: "Acme",
      lobbySubtitle: "Hello",
      logoUrl: "https://cdn.example.com/logo.png",
      wordmark: "Acme Co",
      themePreset: "emerald",
      primaryColor: "#10b981",
      bgAnimation: "wave",
      bgAnimationSpeed: 4,
      patternSizeMode: "percent",
      patternSize: 32,
      patternTint: "primary",
      patternTintOpacity: 60,
      fontFamily: "Inter, system-ui, sans-serif",
      customCss: ".x { color: red }",
    });
  });
});

describe("resolveApiBrandUi", () => {
  it("prefers groups over legacy ui for same keys", () => {
    const fields = resolveApiBrandUi({
      ui: { lobbyTitle: "Legacy", themePreset: "sky" },
      identity: { lobby_title: "New" },
      palette: { theme_preset: "emerald" },
    });
    expect(fields?.lobbyTitle).toBe("New");
    expect(fields?.themePreset).toBe("emerald");
  });

  it("falls back to legacy ui when groups absent", () => {
    const fields = resolveApiBrandUi({
      ui: { lobbyTitle: "Legacy", themePreset: "violet" },
    });
    expect(fields?.lobbyTitle).toBe("Legacy");
    expect(fields?.themePreset).toBe("violet");
  });
});
