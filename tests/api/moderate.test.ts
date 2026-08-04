// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};

const roomsFindFirst = vi.fn();
const participantsFindFirst = vi.fn();
const moderateParticipant = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      rooms: {
        findFirst: (...args: unknown[]) => roomsFindFirst(...args),
      },
      participants: {
        findFirst: (...args: unknown[]) => participantsFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/lib/livekit", () => ({
  moderateParticipant: (...args: unknown[]) => moderateParticipant(...args),
}));

import { POST as moderate } from "@/app/api/rooms/[slug]/moderate/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/rooms/weekly/moderate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const ctx = { params: Promise.resolve({ slug: "weekly" }) };

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  roomsFindFirst.mockReset();
  participantsFindFirst.mockReset();
  moderateParticipant.mockReset();
  moderateParticipant.mockResolvedValue({ ok: true });
});

describe("POST /api/rooms/[slug]/moderate", () => {
  it("rejects anonymous callers", async () => {
    const res = await moderate(
      jsonRequest({ action: "mute", identity: "guest_1" }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("forbids non-hosts", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-guest";
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      slug: "weekly",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
    });
    participantsFindFirst.mockResolvedValue(undefined);

    const res = await moderate(
      jsonRequest({ action: "remove", identity: "guest_1" }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(moderateParticipant).not.toHaveBeenCalled();
  });

  it("lets the owner mute a participant", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      slug: "weekly",
      ownerIdentityId: "identity-owner",
      livekitRoomName: "meet_weekly",
    });

    const res = await moderate(
      jsonRequest({ action: "mute", identity: "guest_abc" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(moderateParticipant).toHaveBeenCalledWith({
      livekitRoomName: "meet_weekly",
      identity: "guest_abc",
      action: "mute",
    });
  });
});
