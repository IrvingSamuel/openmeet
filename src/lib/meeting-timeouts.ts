/** Default seconds without participants (after first join) before auto-end. */
export const DEFAULT_MEETING_EMPTY_TIMEOUT_SEC = 300;
/** Default LiveKit room emptyTimeout (seconds). */
export const DEFAULT_LIVEKIT_EMPTY_TIMEOUT_SEC = 300;
/** Default max age for scheduled meetings that never got a join (7 days). */
export const DEFAULT_SCHEDULED_MAX_AGE_SEC = 604_800;
/** Allowed range for per-meeting / API empty_timeout_sec. */
export const EMPTY_TIMEOUT_SEC_MIN = 60;
export const EMPTY_TIMEOUT_SEC_MAX = 86_400;

function parseEnvSec(
  raw: string | undefined,
  fallback: number,
  min = 1,
  max = EMPTY_TIMEOUT_SEC_MAX * 14,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.min(n, max);
}

/** Seconds without a real join (or empty LiveKit room) before auto-end of active meetings. */
export function getMeetingEmptyTimeoutSec(): number {
  return parseEnvSec(
    process.env.MEETING_EMPTY_TIMEOUT_SEC,
    DEFAULT_MEETING_EMPTY_TIMEOUT_SEC,
    EMPTY_TIMEOUT_SEC_MIN,
  );
}

/** LiveKit SFU emptyTimeout when creating a room. */
export function getLiveKitEmptyTimeoutSec(): number {
  return parseEnvSec(
    process.env.LIVEKIT_EMPTY_TIMEOUT_SEC,
    DEFAULT_LIVEKIT_EMPTY_TIMEOUT_SEC,
    EMPTY_TIMEOUT_SEC_MIN,
  );
}

/** Max age for scheduled meetings that never received a join (garbage cleanup). */
export function getScheduledMaxAgeSec(): number {
  return parseEnvSec(
    process.env.MEETING_SCHEDULED_MAX_AGE_SEC,
    DEFAULT_SCHEDULED_MAX_AGE_SEC,
    EMPTY_TIMEOUT_SEC_MIN,
    EMPTY_TIMEOUT_SEC_MAX * 30,
  );
}

/**
 * Clamp and validate an API/override empty timeout.
 * Returns null when value is absent (caller should use env default).
 */
export function clampEmptyTimeoutSec(
  value: number | null | undefined,
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n < EMPTY_TIMEOUT_SEC_MIN || n > EMPTY_TIMEOUT_SEC_MAX) {
    throw new Error("empty_timeout_sec_out_of_range");
  }
  return n;
}

/** Effective empty timeout for a meeting row (override or env). */
export function resolveEmptyTimeoutSec(
  meetingOverride: number | null | undefined,
): number {
  return meetingOverride ?? getLiveKitEmptyTimeoutSec();
}

/**
 * @deprecated Prefer getMeetingEmptyTimeoutSec() — numeric default for older tests.
 */
export const MEETING_EMPTY_TIMEOUT_SEC = DEFAULT_MEETING_EMPTY_TIMEOUT_SEC;
