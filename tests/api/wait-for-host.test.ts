// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
  name: undefined as string | undefined,
  email: undefined as string | undefined,
};
const loadMeetingBySlugAfterExpiry = vi.fn();
const hasHostEntryGrant = vi.fn();
const meetingHasActiveHost = vi.fn();
const hostEntryDisplayName = vi.fn();
const participantsInsert = vi.fn();
const mintRoomToken = vi.fn();
const syncRoomMetadata = vi.fn();
const activateMeetingIfScheduled = vi.fn();
const resolveRecordingConfig = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/host-entry", () => ({
  hasHostEntryGrant: (...args: unknown[]) => hasHostEntryGrant(...args),
  hostEntryDisplayName: (...args: unknown[]) => hostEntryDisplayName(...args),
}));

vi.mock("@/lib/hostAuth", () => ({
  meetingHasActiveHost: (...args: unknown[]) => meetingHasActiveHost(...args),
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
  startMeetingRecording: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      joinRequests: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
    },
    insert: () => ({
      values: (...args: unknown[]) => {
        participantsInsert(...args);
        return { returning: async () => [] };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    }),
  },
}));

import { POST as postToken } from "@/app/api/meetings/by-slug/[slug]/token/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/meetings/by-slug/abc/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  loadMeetingBySlugAfterExpiry.mockReset();
  hasHostEntryGrant.mockReset();
  meetingHasActiveHost.mockReset();
  hostEntryDisplayName.mockReset();
  participantsInsert.mockReset();
  mintRoomToken.mockReset();
  syncRoomMetadata.mockReset();
  activateMeetingIfScheduled.mockReset();
  resolveRecordingConfig.mockReset();
  hasHostEntryGrant.mockResolvedValue(false);
  meetingHasActiveHost.mockResolvedValue(false);
  hostEntryDisplayName.mockResolvedValue(undefined);
  mintRoomToken.mockResolvedValue("lk-token");
  syncRoomMetadata.mockResolvedValue(undefined);
  activateMeetingIfScheduled.mockResolvedValue(undefined);
  resolveRecordingConfig.mockResolvedValue({
    enabled: false,
    engine: "browser",
    controlMode: "manual",
  });
});

describe("wait_for_host token gating", () => {
  it("returns waiting_for_host when no host is present", async () => {
    loadMeetingBySlugAfterExpiry.mockResolvedValue({
      id: "m1",
      slug: "abc",
      title: "Private",
      accessPolicy: "invite",
      status: "scheduled",
      ownerIdentityId: "owner-1",
      roomId: null,
      boardId: null,
      livekitRoomName: "meet_abc",
      emptyTimeoutSec: null,
      waitForHost: true,
      redirectAfterMeet: null,
    });

    const res = await postToken(jsonRequest({ displayName: "Student" }), {
      params: Promise.resolve({ slug: "abc" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("waiting_for_host");
    expect(participantsInsert).not.toHaveBeenCalled();
  });

  it("admits guest when host is already present", async () => {
    loadMeetingBySlugAfterExpiry.mockResolvedValue({
      id: "m1",
      slug: "abc",
      title: "Private",
      accessPolicy: "invite",
      status: "active",
      ownerIdentityId: "owner-1",
      roomId: null,
      boardId: null,
      livekitRoomName: "meet_abc",
      emptyTimeoutSec: null,
      waitForHost: true,
      redirectAfterMeet: "https://lms.example.com/x",
    });
    meetingHasActiveHost.mockResolvedValue(true);

    const res = await postToken(jsonRequest({ displayName: "Student" }), {
      params: Promise.resolve({ slug: "abc" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.token).toBe("lk-token");
    expect(body.role).toBe("participant");
    expect(body.redirectAfterMeet).toBe("https://lms.example.com/x");
  });

  it("admits host via host-entry cookie without waiting", async () => {
    loadMeetingBySlugAfterExpiry.mockResolvedValue({
      id: "m1",
      slug: "abc",
      title: "Private",
      accessPolicy: "invite",
      status: "scheduled",
      ownerIdentityId: "owner-1",
      roomId: null,
      boardId: null,
      livekitRoomName: "meet_abc",
      emptyTimeoutSec: null,
      waitForHost: true,
      redirectAfterMeet: null,
    });
    hasHostEntryGrant.mockResolvedValue(true);
    hostEntryDisplayName.mockResolvedValue("Teacher");

    const res = await postToken(jsonRequest({ displayName: "Teacher" }), {
      params: Promise.resolve({ slug: "abc" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.role).toBe("host");
  });
});
