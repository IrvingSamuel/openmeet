// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElementFullscreen } from "@/hooks/useElementFullscreen";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useElementFullscreen", () => {
  it("tracks fullscreen state via fullscreenchange", async () => {
    const { result } = renderHook(() => useElementFullscreen<HTMLDivElement>());
    const el = document.createElement("div");
    document.body.appendChild(el);
    result.current.ref.current = el;

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => el,
    });

    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.active).toBe(true);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });

    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.active).toBe(false);
    el.remove();
  });
});
