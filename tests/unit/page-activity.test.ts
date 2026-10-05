import { afterEach, describe, expect, it, vi } from "vitest";
import { onPageActive, waitForTimeoutOrPageActive } from "@/lib/page-activity";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("onPageActive", () => {
  it("fires on visible, resume and online but not on hidden", () => {
    const cb = vi.fn();
    const off = onPageActive(cb);

    setVisibility("hidden");
    expect(cb).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("resume"));
    window.dispatchEvent(new Event("online"));
    expect(cb).toHaveBeenCalledTimes(3);

    off();
    window.dispatchEvent(new Event("online"));
    expect(cb).toHaveBeenCalledTimes(3);
  });
});

describe("waitForTimeoutOrPageActive", () => {
  it("resolves on timeout", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void waitForTimeoutOrPageActive(2000).then(done);

    await vi.advanceTimersByTimeAsync(1999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it("resolves early when the tab comes back (throttled timers)", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    setVisibility("hidden");
    void waitForTimeoutOrPageActive(60_000).then(done);

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });

  it("with null timeout waits only for activity", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void waitForTimeoutOrPageActive(null).then(done);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(done).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("resume"));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });
});
