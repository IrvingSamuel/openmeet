// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertMeetingSlugModerator = vi.fn();
const setRoomSpotlight = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ isLoggedIn: true, identityId: "identity-1" }),
}));

vi.mock("@/lib/hostAuth", () => ({
  assertMeetingSlugModerator: (...args: unknown[]) =>
    assertMeetingSlugModerator(...args),
}));

vi.mock("@/lib/livekit", () => ({
  setRoomSpotlight: (...args: unknown[]) => setRoomSpotlight(...args),
}));

import { POST as spotlight } from "@/app/api/meetings/by-slug/[slug]/spotlight/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/meetings/by-slug/weekly/spotlight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const ctx = { params: Promise.resolve({ slug: "weekly" }) };

const moderatorAuth = {
  ok: true,
  room: { livekitRoomName: "meet_weekly" },
  meeting: null,
};

beforeEach(() => {
  assertMeetingSlugModerator.mockReset();
  setRoomSpotlight.mockReset();
  setRoomSpotlight.mockResolvedValue({});
});

describe("POST /api/meetings/by-slug/[slug]/spotlight", () => {
  it("lets a moderator pin a participant for everyone", async () => {
    assertMeetingSlugModerator.mockResolvedValue(moderatorAuth);
    const res = await spotlight(
      jsonRequest({ key: "guest_1:camera", by: "host_1" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(setRoomSpotlight).toHaveBeenCalledWith(
      "meet_weekly",
      expect.objectContaining({ key: "guest_1:camera", by: "host_1" }),
    );
  });

  it("lets a moderator clear the pin", async () => {
    assertMeetingSlugModerator.mockResolvedValue(moderatorAuth);
    const res = await spotlight(jsonRequest({ key: null, by: "host_1" }), ctx);
    expect(res.status).toBe(200);
    expect(setRoomSpotlight).toHaveBeenCalledWith("meet_weekly", null);
  });

  it("forbids regular participants", async () => {
    assertMeetingSlugModerator.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    const res = await spotlight(
      jsonRequest({ key: "guest_1:camera", by: "guest_2" }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(setRoomSpotlight).not.toHaveBeenCalled();
  });

  it("refuses to pin the AI agent", async () => {
    assertMeetingSlugModerator.mockResolvedValue(moderatorAuth);
    const res = await spotlight(
      jsonRequest({ key: "agent-openmeet:camera", by: "host_1" }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(setRoomSpotlight).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const res = await spotlight(jsonRequest({ key: 42 }), ctx);
    expect(res.status).toBe(400);
  });
});
