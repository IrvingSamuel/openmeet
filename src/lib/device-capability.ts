export type PerformanceProfile = "high" | "low";

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

let cached: PerformanceProfile | null = null;

/** Reset memoized profile — for tests only. */
export function resetPerformanceProfileCache(): void {
  cached = null;
}

/**
 * Detect whether this client should use lighter media pipelines
 * (e.g. lower camera capture while background effects run).
 *
 * Memoized for the page lifetime — profile is stable per session.
 */
export function detectPerformanceProfile(
  nav: NavigatorWithMemory = typeof navigator !== "undefined"
    ? navigator
    : ({} as NavigatorWithMemory),
): PerformanceProfile {
  if (cached) return cached;

  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency ?? 4;
  const ua = nav.userAgent ?? "";
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua);

  let webgl2 = true;
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      webgl2 = Boolean(canvas.getContext("webgl2"));
    } catch {
      webgl2 = false;
    }
  }

  const low =
    mobile ||
    !webgl2 ||
    (typeof mem === "number" && mem <= 4) ||
    cores <= 4;

  cached = low ? "low" : "high";
  return cached;
}
