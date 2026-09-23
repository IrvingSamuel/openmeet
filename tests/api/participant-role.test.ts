// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertMeetingSlugHost = vi.fn();
const participantsFindFirst = vi.fn();
const updateParticipantRole = vi.fn();
const updatePatches: unknown[] = [];
const updateReturning = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({
    isLoggedIn: true,
    identityId: "owner-1",
  })),
}));

vi.mock("@/lib/hostAuth", () => ({
  assertMeetingSlugHost: (...args: unknown[]) => assertMeetingSlugHost(...args),
}));

vi.mock("@/lib/livekit", () => ({
  updateParticipantRole: (...args: unknown[]) => updateParticipantRole(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      participants: {
        findFirst: (...args: unknown[]) => participantsFindFirst(...args),
      },
    },
    update: () => ({
      set: (patch: unknown) => {
        updatePatches.push(patch);
        return {
          where: () => ({
            returning: () => updateReturning(),
          }),
        };
      },
    }),
  },
}));

import { POST } from "@/app/api/meetings/by-slug/[slug]/participants/role/route";

function request(body: unknown) {
  return new Request("http://localhost/api/meetings/by-slug/demo/participants/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const context = { params: Promise.resolve({ slug: "demo" }) };
const hostAuth = {
  ok: true as const,
  room: {
    id: "meeting-1",
    slug: "demo",
    title: "Demo",
    ownerIdentityId: "owner-1",
    boardId: null,
    livekitRoomName: "meet_demo",
    accessPolicy: "public",
    roomId: null,
  },
  meeting: null,
};

beforeEach(() => {
  assertMeetingSlugHost.mockReset();
  participantsFindFirst.mockReset();
  updateParticipantRole.mockReset();
  updateReturning.mockReset();
  updatePatches.length = 0;
  assertMeetingSlugHost.mockResolvedValue(hostAuth);
  updateParticipantRole.mockResolvedValue({});
});

describe("POST /api/meetings/by-slug/[slug]/participants/role", () => {
  it("promotes an active participant without changing ownership", async () => {
    const participant = {
      id: "participant-1",
      identityId: "user-2",
      role: "participant",
      livekitIdentity: "user_user-2_tab1",
      leftAt: null,
    };
    participantsFindFirst.mockResolvedValue(participant);
    updateReturning.mockResolvedValue([{ ...participant, role: "moderator" }]);

    const res = await POST(
      request({
        identity: participant.livekitIdentity,
        role: "moderator",
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(updatePatches).toEqual([{ role: "moderator" }]);
    expect(updateParticipantRole).toHaveBeenCalledWith({
      livekitRoomName: "meet_demo",
      identity: participant.livekitIdentity,
      role: "moderator",
    });
    expect(hostAuth.room.ownerIdentityId).toBe("owner-1");
  });

  it("rejects callers that are not hosts", async () => {
    assertMeetingSlugHost.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const res = await POST(
      request({ identity: "guest_1", role: "moderator" }),
      context,
    );

    expect(res.status).toBe(403);
    expect(participantsFindFirst).not.toHaveBeenCalled();
  });

  it("does not demote the meeting owner", async () => {
    participantsFindFirst.mockResolvedValue({
      id: "participant-owner",
      identityId: "owner-1",
      role: "host",
      livekitIdentity: "user_owner-1_tab1",
      leftAt: null,
    });

    const res = await POST(
      request({ identity: "user_owner-1_tab1", role: "participant" }),
      context,
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("participant_role_protected");
    expect(updateParticipantRole).not.toHaveBeenCalled();
  });
});
