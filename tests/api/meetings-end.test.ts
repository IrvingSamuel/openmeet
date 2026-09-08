// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};

const meetingsFindFirst = vi.fn();
const roomsFindFirst = vi.fn();
const participantsFindFirst = vi.fn();
const updateWhere = vi.fn();
const deleteRoom = vi.fn();
const listParticipants = vi.fn();
const removeParticipant = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
      rooms: {
        findFirst: (...args: unknown[]) => roomsFindFirst(...args),
      },
      participants: {
        findFirst: (...args: unknown[]) => participantsFindFirst(...args),
      },
    },
    update: () => ({
      set: () => ({
        where: (...args: unknown[]) => updateWhere(...args),
      }),
    }),
  },
}));

vi.mock("@/lib/livekit", () => ({
  getRoomServiceClient: () => ({
    deleteRoom: (...args: unknown[]) => deleteRoom(...args),
    listParticipants: (...args: unknown[]) => listParticipants(...args),
    removeParticipant: (...args: unknown[]) => removeParticipant(...args),
  }),
}));

import { POST as endMeeting } from "@/app/api/meetings/end/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/meetings/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  meetingsFindFirst.mockReset();
  roomsFindFirst.mockReset();
  participantsFindFirst.mockReset();
  updateWhere.mockReset();
  deleteRoom.mockReset();
  listParticipants.mockReset();
  removeParticipant.mockReset();
  deleteRoom.mockResolvedValue(undefined);
  listParticipants.mockResolvedValue([]);
  removeParticipant.mockResolvedValue(undefined);
  updateWhere.mockResolvedValue(undefined);
});

describe("POST /api/meetings/end", () => {
  const meetingId = "11111111-1111-4111-8111-111111111111";

  it("rejects anonymous callers", async () => {
    const res = await endMeeting(jsonRequest({ meetingId }));
    expect(res.status).toBe(401);
  });

  it("forbids non-hosts", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-guest";
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "active",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
      slug: "weekly",
      title: "Weekly",
      boardId: null,
      accessPolicy: "public",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
    });
    participantsFindFirst.mockResolvedValue(undefined);

    const res = await endMeeting(jsonRequest({ meetingId }));
    expect(res.status).toBe(403);
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it("allows the room owner to end the meeting and deletes the LiveKit room", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "active",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
      slug: "weekly",
      title: "Weekly",
      boardId: null,
      accessPolicy: "public",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
    });

    const res = await endMeeting(jsonRequest({ meetingId }));
    expect(res.status).toBe(200);
    expect(deleteRoom).toHaveBeenCalledWith("meet_weekly");
    // meeting status + participants leftAt
    expect(updateWhere).toHaveBeenCalledTimes(2);
  });

  it("allows ending a scheduled meeting that never started", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: null,
      status: "scheduled",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
      slug: "weekly",
      title: "Weekly",
      boardId: null,
      accessPolicy: "public",
    });

    const res = await endMeeting(jsonRequest({ meetingId }));
    expect(res.status).toBe(200);
    expect(deleteRoom).toHaveBeenCalledWith("meet_weekly");
    expect(updateWhere).toHaveBeenCalledTimes(2);
  });

  it("falls back to removing participants when deleteRoom fails", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "active",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
      slug: "weekly",
      title: "Weekly",
      boardId: null,
      accessPolicy: "public",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
    });
    deleteRoom.mockRejectedValue(new Error("room busy"));
    listParticipants.mockResolvedValue([
      { identity: "user_a" },
      { identity: "user_b" },
    ]);

    const res = await endMeeting(jsonRequest({ meetingId }));
    expect(res.status).toBe(200);
    expect(listParticipants).toHaveBeenCalledWith("meet_weekly");
    expect(removeParticipant).toHaveBeenCalledWith("meet_weekly", "user_a");
    expect(removeParticipant).toHaveBeenCalledWith("meet_weekly", "user_b");
  });
});
