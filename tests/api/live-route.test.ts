// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const meetingsFindFirst = vi.fn();
const resolveLiveStreamConfig = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: { findFirst: (...a: unknown[]) => meetingsFindFirst(...a) },
    },
  },
}));

vi.mock("@/lib/app-settings", () => ({
  resolveLiveStreamConfig: (...a: unknown[]) => resolveLiveStreamConfig(...a),
}));

const latestLiveStream = vi.fn();
const assertMeetingModerator = vi.fn();

vi.mock("@/lib/session", () => ({ getSession: () => Promise.resolve({}) }));
vi.mock("@/lib/hostAuth", () => ({
  assertMeetingModerator: (...a: unknown[]) => assertMeetingModerator(...a),
}));

vi.mock("@/lib/live-stream", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/live-stream")>(
      "@/lib/live-stream",
    );
  return {
    meetingLiveStreamAllowed: actual.meetingLiveStreamAllowed,
    serializeLiveStream: actual.serializeLiveStream,
    refreshLiveStreamStatus: () => Promise.resolve(null),
    latestLiveStream: (...a: unknown[]) => latestLiveStream(...a),
    startMeetingLiveStream: vi.fn(),
    stopMeetingLiveStream: vi.fn(),
  };
});

import { GET } from "@/app/api/meetings/[id]/live/route";

const MEETING_ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: MEETING_ID }) };
const req = () => new Request(`http://localhost/api/meetings/${MEETING_ID}/live`);

async function enabledFor(liveStreamEnabled: boolean | null) {
  meetingsFindFirst.mockResolvedValue({
    id: MEETING_ID,
    captionsEnabled: true,
    liveStreamEnabled,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await GET(req() as any, ctx);
  return (await res.json()).enabled as boolean;
}

beforeEach(() => {
  delete process.env.LIVE_STREAM_MEETING_DEFAULT;
  meetingsFindFirst.mockReset();
  resolveLiveStreamConfig.mockReset();
  resolveLiveStreamConfig.mockResolvedValue({ enabled: true, quality: "720p" });
  latestLiveStream.mockReset();
  latestLiveStream.mockResolvedValue(undefined);
  assertMeetingModerator.mockReset();
});

afterEach(() => {
  delete process.env.LIVE_STREAM_MEETING_DEFAULT;
});

describe("GET /api/meetings/[id]/live — button hidden without permission", () => {
  it("allowed meeting and instance on: enabled", async () => {
    expect(await enabledFor(true)).toBe(true);
  });

  it("meeting without permission: no button", async () => {
    expect(await enabledFor(false)).toBe(false);
  });

  it("meeting without a value follows LIVE_STREAM_MEETING_DEFAULT", async () => {
    expect(await enabledFor(null)).toBe(true);
    process.env.LIVE_STREAM_MEETING_DEFAULT = "off";
    expect(await enabledFor(null)).toBe(false);
  });

  it("instance switch off beats the meeting permission", async () => {
    resolveLiveStreamConfig.mockResolvedValue({ enabled: false, quality: "720p" });
    expect(await enabledFor(true)).toBe(false);
  });
});

describe("GET /api/meetings/[id]/live — lastError", () => {
  async function lastErrorFor(moderator: boolean) {
    meetingsFindFirst.mockResolvedValue({
      id: MEETING_ID,
      captionsEnabled: true,
      liveStreamEnabled: true,
    });
    latestLiveStream.mockResolvedValue({
      status: "failed",
      error: "dial tcp a.rtmp.youtube.com:1935: connection refused",
      endedAt: new Date(),
    });
    assertMeetingModerator.mockResolvedValue(
      moderator
        ? { ok: true, meeting: {} }
        : { ok: false, status: 403, error: "forbidden" },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req() as any, ctx);
    return (await res.json()).lastError as string | null;
  }

  it("is returned to moderators", async () => {
    expect(await lastErrorFor(true)).toContain("connection refused");
  });

  it("is hidden from everyone else", async () => {
    expect(await lastErrorFor(false)).toBeNull();
  });

  it("does not check the session when there is no recent failure", async () => {
    await enabledFor(true);
    expect(assertMeetingModerator).not.toHaveBeenCalled();
  });
});
