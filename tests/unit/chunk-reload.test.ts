import { beforeEach, describe, expect, it } from "vitest";
import {
  canAutoReload,
  isChunkLoadError,
  markAutoReload,
} from "@/lib/chunk-reload";

describe("isChunkLoadError", () => {
  it("detects webpack and dynamic-import chunk failures", () => {
    const named = new Error("Loading chunk 7368 failed.");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk app-pages-browser failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 123 failed."))).toBe(true);
    expect(
      isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js")),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("ignores ordinary render errors", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed")).toBe(false);
  });
});

describe("auto reload guard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("allows one reload, then blocks until the cooldown passes", () => {
    const t0 = 1_000_000;
    expect(canAutoReload(t0)).toBe(true);
    expect(markAutoReload(t0)).toBe(true);
    expect(canAutoReload(t0 + 5_000)).toBe(false);
    expect(markAutoReload(t0 + 5_000)).toBe(false);
    expect(canAutoReload(t0 + 61_000)).toBe(true);
  });
});
