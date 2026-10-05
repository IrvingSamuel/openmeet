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

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/hostAuth", () => ({ assertMeetingModerator: vi.fn() }));

vi.mock("@/lib/live-stream", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/live-stream")>(
      "@/lib/live-stream",
    );
  return {
    meetingLiveStreamAllowed: actual.meetingLiveStreamAllowed,
    serializeLiveStream: actual.serializeLiveStream,
    refreshLiveStreamStatus: () => Promise.resolve(null),
    latestLiveStream: () => Promise.resolve(undefined),
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
