// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
  name: undefined as string | undefined,
  email: undefined as string | undefined,
};

const loadMeetingBySlugAfterExpiry = vi.fn();
const activateMeetingIfScheduled = vi.fn();
const insertValues = vi.fn();
const mintRoomToken = vi.fn();
const syncRoomMetadata = vi.fn();
const resolveRecordingConfig = vi.fn();
const startMeetingRecording = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/meeting-lifecycle", () => ({
  loadMeetingBySlugAfterExpiry: (...args: unknown[]) =>
    loadMeetingBySlugAfterExpiry(...args),
  activateMeetingIfScheduled: (...args: unknown[]) =>
    activateMeetingIfScheduled(...args),
}));

vi.mock("@/lib/livekit", () => ({
  mintRoomToken: (...args: unknown[]) => mintRoomToken(...args),
  syncRoomMetadata: (...args: unknown[]) => syncRoomMetadata(...args),
}));

vi.mock("@/lib/app-settings", () => ({
  resolveRecordingConfig: (...args: unknown[]) => resolveRecordingConfig(...args),
}));

vi.mock("@/lib/recording", () => ({
  startMeetingRecording: (...args: unknown[]) => startMeetingRecording(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      joinRequests: {
        findFirst: vi.fn(),
      },
    },
    insert: () => ({
      values: (...args: unknown[]) => {
        insertValues(...args);
        return Promise.resolve(undefined);
      },
    }),
  },
}));

import { POST as tokenPost } from "@/app/api/meetings/by-slug/[slug]/token/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/meetings/by-slug/abc/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const params = Promise.resolve({ slug: "abc" });

beforeEach(() => {
  session.isLoggedIn = true;
  session.identityId = "identity-owner";
  session.name = "Host";
  session.email = "host@example.com";
  loadMeetingBySlugAfterExpiry.mockReset();
  activateMeetingIfScheduled.mockReset();
  insertValues.mockReset();
  mintRoomToken.mockReset();
  syncRoomMetadata.mockReset();
  resolveRecordingConfig.mockReset();
  startMeetingRecording.mockReset();
  mintRoomToken.mockResolvedValue("jwt-token");
  syncRoomMetadata.mockResolvedValue(undefined);
  activateMeetingIfScheduled.mockResolvedValue(true);
  resolveRecordingConfig.mockResolvedValue({
    enabled: false,
    controlMode: "manual",
    engine: "egress",
  });
});

describe("POST /api/meetings/by-slug/[slug]/token", () => {
  it("rejects ended meetings", async () => {
    loadMeetingBySlugAfterExpiry.mockResolvedValue({
      id: "m1",
      slug: "abc",
      title: "Demo",
      status: "ended",
      accessPolicy: "public",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_abc",
      roomId: null,
      boardId: null,
    });

    const res = await tokenPost(jsonRequest({ displayName: "Host" }), {
      params,
    });
    expect(res.status).toBe(410);
    expect(activateMeetingIfScheduled).not.toHaveBeenCalled();
  });

  it("activates a scheduled meeting on real join", async () => {
    loadMeetingBySlugAfterExpiry.mockResolvedValue({
      id: "m1",
      slug: "abc",
      title: "Demo",
      status: "scheduled",
      accessPolicy: "public",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_abc",
      roomId: null,
      boardId: null,
    });

    const res = await tokenPost(jsonRequest({ displayName: "Host" }), {
      params,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.token).toBe("jwt-token");
    expect(insertValues).toHaveBeenCalled();
    expect(syncRoomMetadata).toHaveBeenCalledWith(
      "meet_abc",
      expect.objectContaining({ meetingId: "m1", slug: "abc" }),
    );
    expect(activateMeetingIfScheduled).toHaveBeenCalledWith("m1");
  });

  it("does not activate while invite join request is pending", async () => {
    session.identityId = "identity-guest";
    loadMeetingBySlugAfterExpiry.mockResolvedValue({
      id: "m1",
      slug: "abc",
      title: "Demo",
      status: "scheduled",
      accessPolicy: "invite",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_abc",
      roomId: null,
      boardId: null,
    });

    const { db } = await import("@/db");
    vi.mocked(db.query.joinRequests.findFirst).mockResolvedValue(undefined);
    const insertReturning = vi.fn().mockResolvedValue([
      { id: "req-1", status: "pending" },
    ]);
    vi.spyOn(db, "insert").mockReturnValue({
      values: () => ({ returning: () => insertReturning() }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await tokenPost(
      jsonRequest({ displayName: "Guest", clientInstanceId: "inst1" }),
      { params },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(activateMeetingIfScheduled).not.toHaveBeenCalled();
  });
});
