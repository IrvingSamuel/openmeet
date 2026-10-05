// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const meetingsFindFirst = vi.fn();
const liveStreamsFindFirst = vi.fn();
const liveStreamsFindMany = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn(() => Promise.resolve([]));
const startRoomCompositeEgress = vi.fn();
const listEgress = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: { findFirst: (...a: unknown[]) => meetingsFindFirst(...a) },
      liveStreams: {
        findFirst: (...a: unknown[]) => liveStreamsFindFirst(...a),
        findMany: (...a: unknown[]) => liveStreamsFindMany(...a),
      },
    },
    insert: () => ({
      values: () => ({ returning: (...a: unknown[]) => insertReturning(...a) }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: (...a: unknown[]) => updateReturning(...a) }),
      }),
    }),
  },
}));

vi.mock("@/lib/app-settings", () => ({
  resolveLiveStreamConfig: () =>
    Promise.resolve({ enabled: true, quality: "720p" }),
  resolveLocale: () => Promise.resolve("pt-BR"),
}));

vi.mock("@/lib/recording", () => ({
  getEgressClient: () => ({
    startRoomCompositeEgress: (...a: unknown[]) => startRoomCompositeEgress(...a),
    listEgress: (...a: unknown[]) => listEgress(...a),
  }),
}));

import {
  maxConcurrentLiveStreams,
  meetingLiveStreamAllowed,
  normalizeRtmpUrl,
  startMeetingLiveStream,
} from "@/lib/live-stream";

const ENV_KEYS = [
  "LIVE_STREAM_MEETING_DEFAULT",
  "LIVE_STREAM_ALLOWED_HOSTS",
  "LIVE_STREAM_MAX_CONCURRENT",
  "EGRESS_HEALTH_URL",
] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  // No real Egress to probe in tests.
  process.env.EGRESS_HEALTH_URL = "none";
  meetingsFindFirst.mockReset();
  liveStreamsFindFirst.mockReset();
  liveStreamsFindMany.mockReset();
  insertReturning.mockReset();
  startRoomCompositeEgress.mockReset();
  listEgress.mockReset();

  meetingsFindFirst.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    status: "active",
    livekitRoomName: "meet_room",
  });
  liveStreamsFindFirst.mockResolvedValue(undefined);
  liveStreamsFindMany.mockResolvedValue([]);
  insertReturning.mockResolvedValue([
    { id: "row-1", status: "starting", createdAt: new Date() },
  ]);
  startRoomCompositeEgress.mockResolvedValue({ egressId: "EG_new", status: 0 });
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("normalizeRtmpUrl", () => {
  it("accepts the YouTube default when nothing is given", () => {
    expect(normalizeRtmpUrl(null)).toBe("rtmp://a.rtmp.youtube.com/live2");
    expect(normalizeRtmpUrl("rtmps://a.rtmps.youtube.com:443/live2/")).toBe(
      "rtmps://a.rtmps.youtube.com:443/live2",
    );
    expect(normalizeRtmpUrl("rtmp://B.RTMP.YouTube.com/live2")).not.toBeNull();
  });

  it("rejects hosts outside the list, including internal ones", () => {
    expect(normalizeRtmpUrl("rtmp://127.0.0.1/live2")).toBeNull();
    expect(normalizeRtmpUrl("rtmp://localhost:6379/x")).toBeNull();
    expect(normalizeRtmpUrl("rtmp://10.0.0.5/live")).toBeNull();
    expect(normalizeRtmpUrl("rtmp://live.twitch.tv/app")).toBeNull();
    expect(
      normalizeRtmpUrl("rtmp://a.rtmp.youtube.com.evil.example/live2"),
    ).toBeNull();
  });

  it("rejects ports other than 1935/443 and embedded credentials", () => {
    expect(normalizeRtmpUrl("rtmp://a.rtmp.youtube.com:6379/live2")).toBeNull();
    expect(
      normalizeRtmpUrl("rtmp://u:p@a.rtmp.youtube.com/live2"),
    ).toBeNull();
  });

  it("follows the env list, and * opens it to any host", () => {
    process.env.LIVE_STREAM_ALLOWED_HOSTS = "live.twitch.tv";
    expect(normalizeRtmpUrl("rtmp://live.twitch.tv/app")).not.toBeNull();
    expect(normalizeRtmpUrl("rtmp://a.rtmp.youtube.com/live2")).toBeNull();

    process.env.LIVE_STREAM_ALLOWED_HOSTS = "*";
    expect(normalizeRtmpUrl("rtmp://10.0.0.5:9999/live")).not.toBeNull();
  });

  it("still rejects anything that is not rtmp(s)", () => {
    process.env.LIVE_STREAM_ALLOWED_HOSTS = "*";
    expect(normalizeRtmpUrl("http://a.rtmp.youtube.com/live2")).toBeNull();
    expect(normalizeRtmpUrl("rtmp://a b/live2")).toBeNull();
  });
});

describe("maxConcurrentLiveStreams", () => {
  it("defaults to 2, reads the env, none disables, junk falls back", () => {
    expect(maxConcurrentLiveStreams()).toBe(2);
    process.env.LIVE_STREAM_MAX_CONCURRENT = "5";
    expect(maxConcurrentLiveStreams()).toBe(5);
    process.env.LIVE_STREAM_MAX_CONCURRENT = "none";
    expect(maxConcurrentLiveStreams()).toBeNull();
    process.env.LIVE_STREAM_MAX_CONCURRENT = "0";
    expect(maxConcurrentLiveStreams()).toBe(2);
  });
});

describe("meetingLiveStreamAllowed", () => {
  it("meeting value wins; without one it follows the env, on by default", () => {
    expect(meetingLiveStreamAllowed({ liveStreamEnabled: true })).toBe(true);
    expect(meetingLiveStreamAllowed({ liveStreamEnabled: false })).toBe(false);
    expect(meetingLiveStreamAllowed({ liveStreamEnabled: null })).toBe(true);
    expect(meetingLiveStreamAllowed({})).toBe(true);

    process.env.LIVE_STREAM_MEETING_DEFAULT = "off";
    expect(meetingLiveStreamAllowed({ liveStreamEnabled: null })).toBe(false);
    expect(meetingLiveStreamAllowed({ liveStreamEnabled: true })).toBe(true);
  });
});

describe("startMeetingLiveStream", () => {
  const start = (rtmpUrl?: string) =>
    startMeetingLiveStream({
      meetingId: "11111111-1111-4111-8111-111111111111",
      streamKey: "abcd-efgh-ijkl-mnop-qrst",
      rtmpUrl,
    });

  it("rejects a destination outside the list without calling Egress", async () => {
    const res = await start("rtmp://127.0.0.1:1935/live");
    expect(res).toMatchObject({ ok: false, error: "invalid_rtmp_url" });
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  it("refuses at the cap, counting only what Egress reports as running", async () => {
    liveStreamsFindMany.mockResolvedValue([
      { egressId: "EG_a", createdAt: new Date() },
      { egressId: "EG_b", createdAt: new Date() },
    ]);
    listEgress.mockResolvedValue([{ egressId: "EG_a" }, { egressId: "EG_b" }]);

    const res = await start();
    expect(res).toMatchObject({
      ok: false,
      error: "live_limit_reached",
      status: 429,
    });
    expect(listEgress).toHaveBeenCalledWith({ active: true });
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  it("a row stuck in live with no running egress does not take a slot", async () => {
    liveStreamsFindMany.mockResolvedValue([
      { egressId: "EG_morto", createdAt: new Date(0) },
      { egressId: "EG_a", createdAt: new Date() },
    ]);
    listEgress.mockResolvedValue([{ egressId: "EG_a" }]);

    const res = await start();
    expect(res.ok).toBe(true);
    expect(startRoomCompositeEgress).toHaveBeenCalledTimes(1);
  });

  it("a start in flight (no egressId) counts while recent", async () => {
    liveStreamsFindMany.mockResolvedValue([
      { egressId: null, createdAt: new Date() },
      { egressId: "EG_a", createdAt: new Date() },
    ]);
    listEgress.mockResolvedValue([{ egressId: "EG_a" }]);

    const res = await start();
    expect(res).toMatchObject({ ok: false, error: "live_limit_reached" });
  });

  it("refuses instead of guessing when it cannot count", async () => {
    liveStreamsFindMany.mockResolvedValue([
      { egressId: "EG_a", createdAt: new Date() },
    ]);
    listEgress.mockRejectedValue(new Error("twirp error unavailable"));

    const res = await start();
    expect(res).toMatchObject({ ok: false, error: "egress_offline" });
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  it("builds the URL with the key only in the Egress call", async () => {
    const res = await start();
    expect(res.ok).toBe(true);
    const output = startRoomCompositeEgress.mock.calls[0]![1] as {
      urls: string[];
    };
    expect(output.urls).toEqual([
      "rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst",
    ]);
  });

  it("refuses a meeting without permission before touching Egress", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "active",
      livekitRoomName: "meet_room",
      liveStreamEnabled: false,
    });

    const res = await start();
    expect(res).toMatchObject({
      ok: false,
      error: "live_not_allowed",
      status: 403,
    });
    expect(insertReturning).not.toHaveBeenCalled();
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  it("with the default off, a meeting without a value is refused too", async () => {
    process.env.LIVE_STREAM_MEETING_DEFAULT = "off";
    const res = await start();
    expect(res).toMatchObject({ ok: false, error: "live_not_allowed" });
  });
});
