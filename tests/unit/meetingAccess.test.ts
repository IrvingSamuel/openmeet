// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const meetingsFindFirst = vi.fn();
const roomsFindFirst = vi.fn();
const participantsFindFirst = vi.fn();

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
  },
}));

import { assertMeetingSummaryAccess } from "@/lib/meetingAccess";

beforeEach(() => {
  meetingsFindFirst.mockReset();
  roomsFindFirst.mockReset();
  participantsFindFirst.mockReset();
});

const meetingId = "11111111-1111-4111-8111-111111111111";

describe("assertMeetingSummaryAccess", () => {
  it("allows the room owner", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "active",
      summaryStatus: "pending",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      slug: "weekly",
    });

    const result = await assertMeetingSummaryAccess({
      meetingId,
      session: {
        isLoggedIn: true,
        identityId: "identity-owner",
      } as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.isOwner).toBe(true);
  });

  it("allows a logged-in participant", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "ended",
      summaryStatus: "ready",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      slug: "weekly",
    });
    participantsFindFirst.mockResolvedValue({
      id: "p-1",
      meetingId,
      identityId: "identity-guest",
    });

    const result = await assertMeetingSummaryAccess({
      meetingId,
      session: {
        isLoggedIn: true,
        identityId: "identity-guest",
      } as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isParticipant).toBe(true);
      expect(result.isOwner).toBe(false);
    }
  });

  it("allows anonymous access to ended meetings when enabled", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "ended",
      summaryStatus: "ready",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      slug: "weekly",
    });

    const result = await assertMeetingSummaryAccess({
      meetingId,
      session: { isLoggedIn: false } as never,
      allowEndedPublic: true,
    });
    expect(result.ok).toBe(true);
  });

  it("denies anonymous access to active meetings", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "active",
      summaryStatus: "pending",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      slug: "weekly",
    });

    const result = await assertMeetingSummaryAccess({
      meetingId,
      session: { isLoggedIn: false } as never,
      allowEndedPublic: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("denies logged-in strangers", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
      status: "ended",
      summaryStatus: "ready",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      ownerIdentityId: "identity-owner",
      slug: "weekly",
    });
    participantsFindFirst.mockResolvedValue(undefined);

    const result = await assertMeetingSummaryAccess({
      meetingId,
      session: {
        isLoggedIn: true,
        identityId: "identity-stranger",
      } as never,
      allowEndedPublic: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
