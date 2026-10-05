/** True when the document is hidden (background tab, minimized, covered on Windows). */
export function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Subscribe to the signals that mean "the page can talk to the network again":
 * tab became visible, Chrome Page Lifecycle `resume` (after `freeze`), or `online`.
 */
export function onPageActive(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("resume", cb);
  window.addEventListener("online", cb);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("resume", cb);
    window.removeEventListener("online", cb);
  };
}

/**
 * Resolves after `ms`, or earlier as soon as the page becomes active.
 * Background tabs clamp timers (≥1 min under intensive throttling), so a plain
 * setTimeout can stall reconnects long after the user is back.
 * Pass `ms = null` to wait only for activity.
 */
export function waitForTimeoutOrPageActive(ms: number | null): Promise<void> {
  return new Promise((resolve) => {
    let timer: number | undefined;
    const done = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const unsubscribe = onPageActive(done);
    if (ms !== null) timer = window.setTimeout(done, ms);
  });
}
