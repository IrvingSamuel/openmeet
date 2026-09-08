// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};

const actionItemsFindFirst = vi.fn();
const updateReturning = vi.fn();
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
      actionItems: {
        findFirst: (...args: unknown[]) => actionItemsFindFirst(...args),
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: (...args: unknown[]) => updateReturning(...args),
        }),
      }),
    }),
  },
}));

import { PATCH } from "@/app/api/meetings/action-items/[id]/route";

const itemId = "22222222-2222-4222-8222-222222222222";
const meetingId = "11111111-1111-4111-8111-111111111111";

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/meetings/action-items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  actionItemsFindFirst.mockReset();
  updateReturning.mockReset();
  assertMeetingSummaryAccess.mockReset();
});

describe("PATCH /api/meetings/action-items/[id]", () => {
  it("rejects anonymous callers", async () => {
    const res = await PATCH(patchRequest({ status: "done" }), {
      params: Promise.resolve({ id: itemId }),
    });
    expect(res.status).toBe(401);
    expect(actionItemsFindFirst).not.toHaveBeenCalled();
  });

  it("rejects invalid body", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    const res = await PATCH(patchRequest({ status: "created" }), {
      params: Promise.resolve({ id: itemId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when item is missing", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    actionItemsFindFirst.mockResolvedValue(undefined);

    const res = await PATCH(patchRequest({ status: "done" }), {
      params: Promise.resolve({ id: itemId }),
    });
    expect(res.status).toBe(404);
  });

  it("forbids users without summary access", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-guest";
    actionItemsFindFirst.mockResolvedValue({
      id: itemId,
      meetingId,
      title: "Follow up",
      status: "pending",
    });
    assertMeetingSummaryAccess.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    const res = await PATCH(patchRequest({ status: "done" }), {
      params: Promise.resolve({ id: itemId }),
    });
    expect(res.status).toBe(403);
    expect(assertMeetingSummaryAccess).toHaveBeenCalledWith({
      meetingId,
      session,
      allowEndedPublic: false,
    });
    expect(updateReturning).not.toHaveBeenCalled();
  });

  it("updates status for authorized users", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    actionItemsFindFirst.mockResolvedValue({
      id: itemId,
      meetingId,
      title: "Follow up",
      status: "pending",
    });
    assertMeetingSummaryAccess.mockResolvedValue({
      ok: true,
      meeting: { id: meetingId },
      room: {},
      isOwner: true,
      isParticipant: false,
    });
    updateReturning.mockResolvedValue([
      {
        id: itemId,
        meetingId,
        title: "Follow up",
        status: "done",
      },
    ]);

    const res = await PATCH(patchRequest({ status: "done" }), {
      params: Promise.resolve({ id: itemId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.status).toBe("done");
  });
});
