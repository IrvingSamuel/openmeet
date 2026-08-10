// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { isLoggedIn: false, identityId: undefined as string | undefined };

const roomsFindFirst = vi.fn();
const roomsFindMany = vi.fn();
const roomBrandsFindFirst = vi.fn();
const identityBrandsFindFirst = vi.fn();
const meetingsFindFirst = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn();
const brandUpdateSet = vi.fn();
const deleteWhere = vi.fn();
const deleteRoomLivekit = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/livekit", () => ({
  getRoomServiceClient: () => ({
    deleteRoom: (...args: unknown[]) => deleteRoomLivekit(...args),
  }),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      rooms: {
        findFirst: (...args: unknown[]) => roomsFindFirst(...args),
        findMany: (...args: unknown[]) => roomsFindMany(...args),
      },
      roomBrands: {
        findFirst: (...args: unknown[]) => roomBrandsFindFirst(...args),
      },
      identityBrands: {
        findFirst: (...args: unknown[]) => identityBrandsFindFirst(...args),
      },
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
    },
    insert: () => ({
      values: () => ({ returning: () => insertReturning() }),
    }),
    update: () => ({
      set: (patch: unknown) => {
        brandUpdateSet(patch);
        return {
          where: () => ({
            returning: () => updateReturning(),
          }),
        };
      },
    }),
    delete: () => ({
      where: (...args: unknown[]) => deleteWhere(...args),
    }),
  },
}));

import { GET as listRooms, POST as createRoom } from "@/app/api/rooms/route";
import {
  GET as getRoom,
  PATCH as patchRoom,
  DELETE as deleteRoom,
} from "@/app/api/rooms/[slug]/route";

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/rooms", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  roomsFindFirst.mockReset();
  roomsFindMany.mockReset();
  roomBrandsFindFirst.mockReset();
  identityBrandsFindFirst.mockReset();
  meetingsFindFirst.mockReset();
  insertReturning.mockReset();
  updateReturning.mockReset();
  brandUpdateSet.mockReset();
  deleteWhere.mockReset();
  deleteRoomLivekit.mockReset();
  roomBrandsFindFirst.mockResolvedValue({ themePreset: "sky" });
  identityBrandsFindFirst.mockResolvedValue(undefined);
  meetingsFindFirst.mockResolvedValue(undefined);
  deleteRoomLivekit.mockResolvedValue(undefined);
  deleteWhere.mockResolvedValue(undefined);
});

describe("GET /api/rooms", () => {
  it("rejects anonymous callers", async () => {
    const res = await listRooms();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns only the rooms owned by the session identity", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    roomsFindMany.mockResolvedValue([{ id: "r1", slug: "weekly" }]);

    const res = await listRooms();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      rooms: [{ id: "r1", slug: "weekly" }],
    });
    expect(roomsFindMany).toHaveBeenCalledOnce();
  });
});

describe("POST /api/rooms", () => {
  it("rejects anonymous callers", async () => {
    const res = await createRoom(jsonRequest({ title: "Weekly" }));
    expect(res.status).toBe(401);
  });

  it("creates a room and returns 201", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r1",
          slug: "abc",
          title: "Weekly",
          kind: "persistent",
        },
      ])
      .mockResolvedValueOnce([{ roomId: "r1", themePreset: "violet" }]);

    const res = await createRoom(jsonRequest({ title: "Weekly" }));
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.room.slug).toBe("abc");
  });

  it("refuses an invalid slug", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    await expect(
      createRoom(jsonRequest({ title: "Weekly", slug: "Not Valid!" })),
    ).rejects.toThrow();
  });

  it("refuses an empty title", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    await expect(createRoom(jsonRequest({ title: "" }))).rejects.toThrow();
  });
});

describe("GET /api/rooms/[slug]", () => {
  it("404s for an unknown slug", async () => {
    roomsFindFirst.mockResolvedValue(undefined);
    const res = await getRoom({} as never, {
      params: Promise.resolve({ slug: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the room together with its brand", async () => {
    roomsFindFirst.mockResolvedValue({
      id: "r1",
      slug: "weekly",
      title: "Weekly",
      accessPolicy: "members",
    });
    const res = await getRoom({} as never, {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.room.slug).toBe("weekly");
    expect(payload.brand.themePreset).toBe("sky");
  });
});

describe("PATCH /api/rooms/[slug]", () => {
  it("rejects anonymous callers", async () => {
    const res = await patchRoom(jsonRequest({ title: "Novo" }, "PATCH"), {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(401);
  });

  it("forbids non-owners", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    roomsFindFirst.mockResolvedValue({
      id: "r1",
      slug: "weekly",
      title: "Weekly",
      ownerIdentityId: "someone-else",
    });
    const res = await patchRoom(jsonRequest({ title: "Novo" }, "PATCH"), {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(403);
  });

  it("renames an owned room", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    roomsFindFirst.mockResolvedValue({
      id: "r1",
      slug: "weekly",
      title: "Weekly",
      ownerIdentityId: "identity-1",
    });
    updateReturning.mockResolvedValue([
      { id: "r1", slug: "weekly", title: "Novo nome" },
    ]);
    roomBrandsFindFirst.mockResolvedValue({
      lobbyTitle: "Weekly",
      wordmark: "Weekly",
    });

    const res = await patchRoom(jsonRequest({ title: "Novo nome" }, "PATCH"), {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.room.title).toBe("Novo nome");
  });
});

describe("DELETE /api/rooms/[slug]", () => {
  it("rejects anonymous callers", async () => {
    const res = await deleteRoom({} as never, {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(401);
  });

  it("forbids non-owners", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    roomsFindFirst.mockResolvedValue({
      id: "r1",
      slug: "weekly",
      ownerIdentityId: "other",
      livekitRoomName: "meet_weekly",
    });
    const res = await deleteRoom({} as never, {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes an owned room and evicts LiveKit", async () => {
    session.isLoggedIn = true;
    session.identityId = "identity-1";
    roomsFindFirst.mockResolvedValue({
      id: "r1",
      slug: "weekly",
      title: "Weekly",
      ownerIdentityId: "identity-1",
      livekitRoomName: "meet_weekly",
    });
    meetingsFindFirst.mockResolvedValue({ id: "m1", status: "active" });

    const res = await deleteRoom({} as never, {
      params: Promise.resolve({ slug: "weekly" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, slug: "weekly" });
    expect(deleteRoomLivekit).toHaveBeenCalledWith("meet_weekly");
    expect(deleteWhere).toHaveBeenCalled();
  });
});
