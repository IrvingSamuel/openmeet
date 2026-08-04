// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
  name: undefined as string | undefined,
  email: undefined as string | undefined,
};

const roomsFindFirst = vi.fn();
const joinRequestsFindFirst = vi.fn();
const joinRequestsFindMany = vi.fn();
const meetingsFindFirst = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn();
const updateSet = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      rooms: {
        findFirst: (...args: unknown[]) => roomsFindFirst(...args),
      },
      joinRequests: {
        findFirst: (...args: unknown[]) => joinRequestsFindFirst(...args),
        findMany: (...args: unknown[]) => joinRequestsFindMany(...args),
      },
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
      participants: {
        findFirst: vi.fn(),
      },
    },
    insert: () => ({
      values: (vals?: unknown) => {
        void vals;
        return {
          returning: () => insertReturning(),
          then: undefined,
        };
      },
    }),
    update: () => ({
      set: (patch: unknown) => {
        updateSet(patch);
        return {
          where: () => ({
            returning: () => updateReturning(),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/lib/livekit", () => ({
  mintRoomToken: vi.fn(async () => "jwt-token"),
  syncRoomMetadata: vi.fn(async () => undefined),
}));

import { POST as tokenPost } from "@/app/api/rooms/[slug]/token/route";
import { GET as listJoinRequests } from "@/app/api/rooms/[slug]/join-requests/route";
import { GET as getJoinRequest } from "@/app/api/rooms/[slug]/join-requests/[id]/route";
import { POST as approveJoin } from "@/app/api/rooms/[slug]/join-requests/[id]/approve/route";
import { POST as denyJoin } from "@/app/api/rooms/[slug]/join-requests/[id]/deny/route";
import { POST as cancelJoin } from "@/app/api/rooms/[slug]/join-requests/[id]/cancel/route";

const inviteRoom = {
  id: "room-1",
  slug: "weekly",
  title: "Weekly",
  ownerIdentityId: "identity-owner",
  accessPolicy: "invite",
  livekitRoomName: "meet_weekly",
  boardId: null,
};

function jsonRequest(body: unknown, url = "http://localhost/api/rooms/weekly/token") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  session.name = undefined;
  session.email = undefined;
  roomsFindFirst.mockReset();
  joinRequestsFindFirst.mockReset();
  joinRequestsFindMany.mockReset();
  meetingsFindFirst.mockReset();
  insertReturning.mockReset();
  updateReturning.mockReset();
  updateSet.mockReset();
});

describe("invite waiting room", () => {
  it("returns pending instead of a token for non-owners", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue(undefined);
    insertReturning.mockResolvedValue([{ id: "req-1", status: "pending" }]);

    const res = await tokenPost(
      jsonRequest({ displayName: "Convidado", clientInstanceId: "tab123" }),
      { params: Promise.resolve({ slug: "weekly" }) },
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.status).toBe("pending");
    expect(payload.requestId).toBe("req-1");
    expect(payload.token).toBeUndefined();
  });

  it("lets the owner enter directly with a host token", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    session.name = "Host";
    roomsFindFirst.mockResolvedValue(inviteRoom);
    meetingsFindFirst.mockResolvedValue({
      id: "meeting-1",
      roomId: "room-1",
      status: "active",
    });

    const res = await tokenPost(
      jsonRequest({ displayName: "Host", clientInstanceId: "hosttab" }),
      { params: Promise.resolve({ slug: "weekly" }) },
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.status).toBe("ready");
    expect(payload.token).toBe("jwt-token");
    expect(payload.role).toBe("host");
  });

  it("lets the owner list pending requests", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindMany.mockResolvedValue([
      {
        id: "req-1",
        displayName: "Ana",
        createdAt: new Date("2026-01-01"),
      },
    ]);

    const res = await listJoinRequests({} as never, {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0].displayName).toBe("Ana");
  });

  it("lets the owner approve a pending request", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      roomId: "room-1",
      status: "pending",
    });
    updateReturning.mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        status: "approved",
      },
    ]);

    const res = await approveJoin({} as never, {
      params: Promise.resolve({
        slug: "weekly",
        id: "22222222-2222-2222-2222-222222222222",
      }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: "approved",
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" }),
    );
  });

  it("lets the owner deny a pending request", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-owner";
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      roomId: "room-1",
      status: "pending",
    });
    updateReturning.mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        status: "denied",
      },
    ]);

    const res = await denyJoin({} as never, {
      params: Promise.resolve({
        slug: "weekly",
        id: "22222222-2222-2222-2222-222222222222",
      }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: "denied",
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "denied" }),
    );
  });

  it("mints a token once for an approved request and marks it consumed", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "approved",
    });
    updateReturning.mockResolvedValue([{ id: "req-1", status: "consumed" }]);
    meetingsFindFirst.mockResolvedValue({
      id: "meeting-1",
      roomId: "room-1",
      status: "active",
    });

    const res = await tokenPost(
      jsonRequest({
        displayName: "Ana",
        clientInstanceId: "tab123",
        requestId: "req-1",
      }),
      { params: Promise.resolve({ slug: "weekly" }) },
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.status).toBe("ready");
    expect(payload.token).toBe("jwt-token");
    expect(payload.role).toBe("participant");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "consumed" }),
    );
  });

  it("rejects a second token mint for an already consumed request", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "consumed",
    });

    const res = await tokenPost(
      jsonRequest({
        displayName: "Ana",
        clientInstanceId: "tab123",
        requestId: "req-1",
      }),
      { params: Promise.resolve({ slug: "weekly" }) },
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "request_already_used",
      status: "consumed",
    });
  });

  it("rejects token mint when clientInstanceId mismatches", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "approved",
    });

    const res = await tokenPost(
      jsonRequest({
        displayName: "Ana",
        clientInstanceId: "other-tab",
        requestId: "req-1",
      }),
      { params: Promise.resolve({ slug: "weekly" }) },
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "request_mismatch",
    });
  });

  it("cancels a pending request when clientInstanceId matches", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "pending",
    });
    updateReturning.mockResolvedValue([{ id: "req-1", status: "cancelled" }]);

    const res = await cancelJoin(
      jsonRequest(
        { clientInstanceId: "tab123" },
        "http://localhost/api/rooms/weekly/join-requests/req-1/cancel",
      ),
      { params: Promise.resolve({ slug: "weekly", id: "req-1" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: "cancelled",
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  it("rejects cancel when clientInstanceId mismatches", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "pending",
    });

    const res = await cancelJoin(
      jsonRequest(
        { clientInstanceId: "other-tab" },
        "http://localhost/api/rooms/weekly/join-requests/req-1/cancel",
      ),
      { params: Promise.resolve({ slug: "weekly", id: "req-1" }) },
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "request_mismatch",
    });
  });

  it("requires clientInstanceId when polling a join request", async () => {
    const req = new NextRequest(
      "http://localhost/api/rooms/weekly/join-requests/req-1",
    );
    const res = await getJoinRequest(req, {
      params: Promise.resolve({ slug: "weekly", id: "req-1" }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "client_instance_required",
    });
  });

  it("returns join-request status when clientInstanceId matches", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "pending",
      displayName: "Ana",
    });

    const req = new NextRequest(
      "http://localhost/api/rooms/weekly/join-requests/req-1?clientInstanceId=tab123",
    );
    const res = await getJoinRequest(req, {
      params: Promise.resolve({ slug: "weekly", id: "req-1" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: "req-1",
      status: "pending",
      displayName: "Ana",
    });
  });

  it("rejects poll when clientInstanceId mismatches", async () => {
    roomsFindFirst.mockResolvedValue(inviteRoom);
    joinRequestsFindFirst.mockResolvedValue({
      id: "req-1",
      roomId: "room-1",
      clientInstanceId: "tab123",
      status: "pending",
      displayName: "Ana",
    });

    const req = new NextRequest(
      "http://localhost/api/rooms/weekly/join-requests/req-1?clientInstanceId=other",
    );
    const res = await getJoinRequest(req, {
      params: Promise.resolve({ slug: "weekly", id: "req-1" }),
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "request_mismatch",
    });
  });
});
