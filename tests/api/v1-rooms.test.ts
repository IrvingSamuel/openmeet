// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};
const roomsFindFirst = vi.fn();
const roomBrandsFindFirst = vi.fn();
const identityBrandsFindFirst = vi.fn();
const usersFindFirst = vi.fn();
const insertReturning = vi.fn();
const getAppSettings = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/app-settings", () => ({
  getAppSettings: (...args: unknown[]) => getAppSettings(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      rooms: {
        findFirst: (...args: unknown[]) => roomsFindFirst(...args),
      },
      roomBrands: {
        findFirst: (...args: unknown[]) => roomBrandsFindFirst(...args),
      },
      identityBrands: {
        findFirst: (...args: unknown[]) => identityBrandsFindFirst(...args),
      },
      users: {
        findFirst: (...args: unknown[]) => usersFindFirst(...args),
      },
    },
    insert: () => ({
      values: () => ({ returning: () => insertReturning() }),
    }),
  },
}));

import { POST as createRoom } from "@/app/api/v1/rooms/route";
import { POST as createMeetingFromRoom } from "@/app/api/v1/rooms/[room_id]/meetings/route";

function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  roomsFindFirst.mockReset();
  roomBrandsFindFirst.mockReset();
  identityBrandsFindFirst.mockReset();
  usersFindFirst.mockReset();
  insertReturning.mockReset();
  getAppSettings.mockReset();
  getAppSettings.mockResolvedValue(null);
  identityBrandsFindFirst.mockResolvedValue(undefined);
  roomBrandsFindFirst.mockResolvedValue(undefined);
  delete process.env.MEET_MCP_TOKEN;
  delete process.env.AGENT_SHARED_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = "https://openmeet.chronos.com.pt";
});

describe("POST /api/v1/rooms", () => {
  it("rejects without auth", async () => {
    const res = await createRoom(
      jsonRequest("http://localhost/api/v1/rooms", { name: "Template" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects session cookie alone", async () => {
    session.isLoggedIn = true;
    session.identityId = "owner-1";
    const res = await createRoom(
      jsonRequest("http://localhost/api/v1/rooms", { name: "Template" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects AGENT_SHARED_SECRET as public API bearer", async () => {
    process.env.AGENT_SHARED_SECRET = "agent-only";
    const res = await createRoom(
      jsonRequest(
        "http://localhost/api/v1/rooms",
        { name: "Template", external_id: "cu-1" },
        { Authorization: "Bearer agent-only" },
      ),
    );
    expect(res.status).toBe(401);
  });

  it("creates a room with platform defaults", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    usersFindFirst.mockResolvedValue({ id: "owner-1" });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r1",
          slug: "tmpl000001",
          title: "Template Acme",
          accessPolicy: "public",
        },
      ])
      .mockResolvedValueOnce([
        {
          roomId: "r1",
          themePreset: "sky",
          primaryColor: "#0ea5e9",
          secondaryColor: "#38bdf8",
          tertiaryColor: "#818cf8",
          background: "#0b1020",
          wordmark: "Template Acme",
          lobbyTitle: "Template Acme",
          lobbySubtitle: "Powered by OpenMeet",
          fontFamily: "Inter, system-ui, sans-serif",
          logoUrl: null,
          faviconUrl: null,
          customCss: null,
        },
      ]);

    const res = await createRoom(
      jsonRequest(
        "http://localhost/api/v1/rooms",
        { name: "Template Acme", external_id: "cu-1" },
        { Authorization: "Bearer secret-token" },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.room_id).toBe("r1");
    expect(body.name).toBe("Template Acme");
    expect(body.url).toContain("/r/tmpl000001");
    expect(body.join_path).toBe("/r/tmpl000001");
    expect(body.brand.palette.theme_preset).toBe("sky");
    expect(body.brand.identity.wordmark).toBe("Template Acme");
  });

  it("creates a room with DB public API token and default owner", async () => {
    getAppSettings.mockResolvedValue({
      publicApiToken: "db-token-value",
      publicApiTokenOwnerId: "admin-owner",
    });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r-db",
          slug: "tmpldb0001",
          title: "DB Token Room",
          accessPolicy: "public",
        },
      ])
      .mockResolvedValueOnce([
        {
          roomId: "r-db",
          themePreset: "sky",
          primaryColor: "#0ea5e9",
          secondaryColor: "#38bdf8",
          tertiaryColor: "#818cf8",
          background: "#0b1020",
          wordmark: "DB Token Room",
          lobbyTitle: "DB Token Room",
          lobbySubtitle: "Powered by OpenMeet",
          fontFamily: "Inter, system-ui, sans-serif",
          logoUrl: null,
          faviconUrl: null,
          customCss: null,
        },
      ]);

    const res = await createRoom(
      jsonRequest(
        "http://localhost/api/v1/rooms",
        { name: "DB Token Room" },
        { Authorization: "Bearer db-token-value" },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.room_id).toBe("r-db");
  });

  it("creates a room with palette.theme_preset", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    usersFindFirst.mockResolvedValue({ id: "owner-1" });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r2",
          slug: "tmpl000002",
          title: "Emerald Room",
          accessPolicy: "public",
        },
      ])
      .mockResolvedValueOnce([
        {
          roomId: "r2",
          themePreset: "emerald",
          primaryColor: "#10b981",
          secondaryColor: "#22c55e",
          tertiaryColor: "#14b8a6",
          background: "#0b1020",
          wordmark: "Emerald Room",
          lobbyTitle: "Emerald Room",
          lobbySubtitle: "Powered by OpenMeet",
          fontFamily: "Inter, system-ui, sans-serif",
          logoUrl: null,
          faviconUrl: null,
          customCss: null,
        },
      ]);

    const res = await createRoom(
      jsonRequest(
        "http://localhost/api/v1/rooms",
        {
          name: "Emerald Room",
          external_id: "cu-1",
          palette: { theme_preset: "emerald" },
        },
        { Authorization: "Bearer secret-token" },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.brand.palette.theme_preset).toBe("emerald");
    expect(body.brand.palette.primary_color).toBe("#10b981");
  });

  it("rejects missing name", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    const res = await createRoom(
      jsonRequest(
        "http://localhost/api/v1/rooms",
        { external_id: "cu-1" },
        { Authorization: "Bearer secret-token" },
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });
});

describe("POST /api/v1/rooms/{room_id}/meetings", () => {
  const roomId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("rejects without auth", async () => {
    const res = await createMeetingFromRoom(
      jsonRequest(`http://localhost/api/v1/rooms/${roomId}/meetings`, {
        title: "Comercial",
      }),
      { params: Promise.resolve({ room_id: roomId }) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects session cookie alone", async () => {
    session.isLoggedIn = true;
    session.identityId = "owner-1";
    const res = await createMeetingFromRoom(
      jsonRequest(`http://localhost/api/v1/rooms/${roomId}/meetings`, {
        title: "Comercial",
      }),
      { params: Promise.resolve({ room_id: roomId }) },
    );
    expect(res.status).toBe(401);
  });

  it("requires title", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    const res = await createMeetingFromRoom(
      jsonRequest(
        `http://localhost/api/v1/rooms/${roomId}/meetings`,
        {},
        { Authorization: "Bearer secret-token" },
      ),
      { params: Promise.resolve({ room_id: roomId }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 404 when room does not exist", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    roomsFindFirst.mockResolvedValue(undefined);

    const res = await createMeetingFromRoom(
      jsonRequest(
        `http://localhost/api/v1/rooms/${roomId}/meetings`,
        { title: "Comercial 8 set" },
        { Authorization: "Bearer secret-token" },
      ),
      { params: Promise.resolve({ room_id: roomId }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("room_not_found");
  });

  it("creates a meeting from room with required title", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    roomsFindFirst.mockResolvedValue({
      id: roomId,
      title: "Template Acme",
      ownerIdentityId: "owner-1",
      boardId: null,
      accessPolicy: "public",
    });
    roomBrandsFindFirst.mockResolvedValue({
      roomId,
      themePreset: "emerald",
      primaryColor: "#10b981",
      secondaryColor: "#22c55e",
      tertiaryColor: "#14b8a6",
      wordmark: "Acme",
      lobbyTitle: "Acme",
      lobbySubtitle: "Powered by OpenMeet",
    });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "m1",
          slug: "meet000001",
          title: "Comercial 8 set",
          accessPolicy: "public",
          roomId,
          emptyTimeoutSec: null,
        },
      ])
      .mockResolvedValueOnce([{ meetingId: "m1" }]);

    const res = await createMeetingFromRoom(
      jsonRequest(
        `http://localhost/api/v1/rooms/${roomId}/meetings`,
        { title: "Comercial 8 set" },
        { Authorization: "Bearer secret-token" },
      ),
      { params: Promise.resolve({ room_id: roomId }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.meeting_id).toBe("m1");
    expect(body.title).toBe("Comercial 8 set");
    expect(body.brand_room_id).toBe(roomId);
    expect(body.url).toContain("/m/meet000001");
    expect(body.join_path).toBe("/m/meet000001");
  });
});
