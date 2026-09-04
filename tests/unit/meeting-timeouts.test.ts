// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  clampEmptyTimeoutSec,
  DEFAULT_LIVEKIT_EMPTY_TIMEOUT_SEC,
  DEFAULT_MEETING_EMPTY_TIMEOUT_SEC,
  DEFAULT_SCHEDULED_MAX_AGE_SEC,
  getLiveKitEmptyTimeoutSec,
  getMeetingEmptyTimeoutSec,
  getScheduledMaxAgeSec,
  resolveEmptyTimeoutSec,
} from "@/lib/meeting-timeouts";

afterEach(() => {
  delete process.env.MEETING_EMPTY_TIMEOUT_SEC;
  delete process.env.LIVEKIT_EMPTY_TIMEOUT_SEC;
  delete process.env.MEETING_SCHEDULED_MAX_AGE_SEC;
});

describe("meeting-timeouts", () => {
  it("uses hybrid defaults", () => {
    expect(getMeetingEmptyTimeoutSec()).toBe(DEFAULT_MEETING_EMPTY_TIMEOUT_SEC);
    expect(getLiveKitEmptyTimeoutSec()).toBe(DEFAULT_LIVEKIT_EMPTY_TIMEOUT_SEC);
    expect(getScheduledMaxAgeSec()).toBe(DEFAULT_SCHEDULED_MAX_AGE_SEC);
    expect(DEFAULT_MEETING_EMPTY_TIMEOUT_SEC).toBe(300);
    expect(DEFAULT_SCHEDULED_MAX_AGE_SEC).toBe(604_800);
  });

  it("reads env overrides", () => {
    process.env.MEETING_EMPTY_TIMEOUT_SEC = "900";
    process.env.LIVEKIT_EMPTY_TIMEOUT_SEC = "600";
    process.env.MEETING_SCHEDULED_MAX_AGE_SEC = "86400";
    expect(getMeetingEmptyTimeoutSec()).toBe(900);
    expect(getLiveKitEmptyTimeoutSec()).toBe(600);
    expect(getScheduledMaxAgeSec()).toBe(86400);
  });

  it("clamps API empty_timeout_sec and rejects out of range", () => {
    expect(clampEmptyTimeoutSec(undefined)).toBeNull();
    expect(clampEmptyTimeoutSec(120)).toBe(120);
    expect(() => clampEmptyTimeoutSec(30)).toThrow(
      "empty_timeout_sec_out_of_range",
    );
    expect(() => clampEmptyTimeoutSec(100_000)).toThrow(
      "empty_timeout_sec_out_of_range",
    );
  });

  it("resolves per-meeting override over env", () => {
    process.env.LIVEKIT_EMPTY_TIMEOUT_SEC = "300";
    expect(resolveEmptyTimeoutSec(null)).toBe(300);
    expect(resolveEmptyTimeoutSec(1800)).toBe(1800);
  });
});
