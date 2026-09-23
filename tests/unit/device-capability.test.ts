import { afterEach, describe, expect, it } from "vitest";
import {
  detectPerformanceProfile,
  resetPerformanceProfileCache,
} from "@/lib/device-capability";

function fakeNav(partial: {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent?: string;
}): Navigator {
  return {
    deviceMemory: partial.deviceMemory,
    hardwareConcurrency: partial.hardwareConcurrency ?? 8,
    userAgent: partial.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64)",
  } as Navigator;
}

describe("detectPerformanceProfile", () => {
  afterEach(() => {
    resetPerformanceProfileCache();
  });

  it("returns high for desktop with enough RAM and cores", () => {
    // jsdom has no webgl2 — stub getContext so WebGL2 looks available.
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as typeof orig;
    try {
      expect(
        detectPerformanceProfile(
          fakeNav({ deviceMemory: 8, hardwareConcurrency: 8 }),
        ),
      ).toBe("high");
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });

  it("returns low when deviceMemory is 4 or less", () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as typeof orig;
    try {
      expect(
        detectPerformanceProfile(
          fakeNav({ deviceMemory: 4, hardwareConcurrency: 8 }),
        ),
      ).toBe("low");
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });

  it("returns low when hardwareConcurrency is 4 or less", () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as typeof orig;
    try {
      expect(
        detectPerformanceProfile(
          fakeNav({ deviceMemory: 16, hardwareConcurrency: 4 }),
        ),
      ).toBe("low");
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });

  it("returns low for mobile user agents", () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as typeof orig;
    try {
      expect(
        detectPerformanceProfile(
          fakeNav({
            deviceMemory: 8,
            hardwareConcurrency: 8,
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          }),
        ),
      ).toBe("low");
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });

  it("memoizes the first result for the session", () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as typeof orig;
    try {
      const first = detectPerformanceProfile(
        fakeNav({ deviceMemory: 2, hardwareConcurrency: 2 }),
      );
      expect(first).toBe("low");
      // Even with a "high" navigator, cache wins until reset.
      expect(
        detectPerformanceProfile(
          fakeNav({ deviceMemory: 32, hardwareConcurrency: 16 }),
        ),
      ).toBe("low");
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });
});
