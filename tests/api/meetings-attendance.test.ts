import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};

const participantsFindMany = vi.fn();
const assertMeetingSummaryAccess = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/meetingAccess", () => ({
  assertMeetingSummaryAccess: (...args: unknown[]) =>
    assertMeetingSummaryAccess(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      participants: {
        findMany: (...args: unknown[]) => participantsFindMany(...args),
      },
    },
  },
}));

import { GET } from "@/app/api/meetings/[id]/attendance/route";

const meetingId = "11111111-1111-4111-8111-111111111111";

function getRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/meetings/${meetingId}/attendance${query}`,
  );
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  participantsFindMany.mockReset();
  assertMeetingSummaryAccess.mockReset();
});

describe("GET /api/meetings/[id]/attendance", () => {
  it("rejects when access is denied", async () => {
    assertMeetingSummaryAccess.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const res = await GET(getRequest(), {
      params: Promise.resolve({ id: meetingId }),
    });
    expect(res.status).toBe(403);
    expect(participantsFindMany).not.toHaveBeenCalled();
  });

  it("returns filtered attendees for an ended meeting", async () => {
    assertMeetingSummaryAccess.mockResolvedValue({
      ok: true,
      meeting: {
        id: meetingId,
        slug: "standup",
        startedAt: new Date("2026-08-04T11:00:00.000Z"),
        endedAt: new Date("2026-08-04T11:30:00.000Z"),
        status: "ended",
      },
      room: {},
      isOwner: true,
      isParticipant: false,
    });
    participantsFindMany.mockResolvedValue([
      {
        identityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        displayName: "Ana",
        role: "host",
        livekitIdentity: "user_1",
        joinedAt: new Date("2026-08-04T11:00:00.000Z"),
        connectedAt: new Date("2026-08-04T11:00:05.000Z"),
        leftAt: new Date("2026-08-04T11:30:00.000Z"),
      },
      {
        identityId: null,
        displayName: "Lobby only",
        role: "participant",
        livekitIdentity: "guest_x",
        joinedAt: new Date("2026-08-04T11:00:10.000Z"),
        connectedAt: null,
        leftAt: null,
      },
      {
        identityId: null,
        displayName: "Agent",
        role: "participant",
        livekitIdentity: "agent-copilot",
        joinedAt: new Date("2026-08-04T11:00:01.000Z"),
        connectedAt: new Date("2026-08-04T11:00:01.000Z"),
        leftAt: new Date("2026-08-04T11:30:00.000Z"),
      },
    ]);

    const res = await GET(getRequest(), {
      params: Promise.resolve({ id: meetingId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.presentCount).toBe(1);
    expect(json.attendees).toHaveLength(1);
    expect(json.attendees[0].displayName).toBe("Ana");
    expect(json.attendees[0].role).toBe("host");
  });

  it("returns CSV when format=csv", async () => {
    assertMeetingSummaryAccess.mockResolvedValue({
      ok: true,
      meeting: {
        id: meetingId,
        slug: "standup",
        startedAt: new Date("2026-08-04T11:00:00.000Z"),
        endedAt: new Date("2026-08-04T11:30:00.000Z"),
        status: "ended",
      },
      room: {},
      isOwner: true,
      isParticipant: false,
    });
    participantsFindMany.mockResolvedValue([
      {
        identityId: null,
        displayName: "Caio",
        role: "participant",
        livekitIdentity: "guest_1",
        joinedAt: new Date("2026-08-04T11:02:00.000Z"),
        connectedAt: new Date("2026-08-04T11:02:00.000Z"),
        leftAt: new Date("2026-08-04T11:28:00.000Z"),
      },
    ]);

    const res = await GET(getRequest("?format=csv"), {
      params: Promise.resolve({ id: meetingId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("displayName,role");
    expect(body).toContain("Caio");
  });
});
