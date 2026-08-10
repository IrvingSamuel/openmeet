// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { isLoggedIn: false, identityId: undefined as string | undefined };
const identityBrandsFindFirst = vi.fn();
const chronosIdentitiesFindFirst = vi.fn();
const insertReturning = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      identityBrands: {
        findFirst: (...args: unknown[]) => identityBrandsFindFirst(...args),
      },
      chronosIdentities: {
        findFirst: (...args: unknown[]) => chronosIdentitiesFindFirst(...args),
      },
    },
    insert: () => ({
      values: () => ({ returning: () => insertReturning() }),
    }),
  },
}));

import { POST as postInstant } from "@/app/api/rooms/instant/route";
import { POST as postV1 } from "@/app/api/v1/instant-meetings/route";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
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
  identityBrandsFindFirst.mockReset();
  chronosIdentitiesFindFirst.mockReset();
  insertReturning.mockReset();
  identityBrandsFindFirst.mockResolvedValue(undefined);
  delete process.env.MEET_MCP_TOKEN;
  delete process.env.AGENT_SHARED_SECRET;
});

describe("POST /api/rooms/instant", () => {
  it("rejects anonymous", async () => {
    const res = await postInstant(jsonRequest("http://localhost/api/rooms/instant", {}));
    expect(res.status).toBe(401);
  });

  it("creates an instant room for the session user", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r1",
          slug: "inst123456",
          title: "Instant",
          kind: "instant",
          accessPolicy: "public",
        },
      ])
      .mockResolvedValueOnce([{ roomId: "r1" }]);

    const res = await postInstant(
      jsonRequest("http://localhost/api/rooms/instant", { title: "Instant" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.room.kind).toBe("instant");
    expect(body.url).toContain("/r/inst123456");
    expect(body.join_path).toBe("/r/inst123456");
  });
});

describe("POST /api/v1/instant-meetings", () => {
  it("rejects without auth", async () => {
    const res = await postV1(
      jsonRequest("http://localhost/api/v1/instant-meetings", { title: "X" }),
    );
    expect(res.status).toBe(401);
  });

  it("creates via bearer + chronos_user_id with ui", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    chronosIdentitiesFindFirst.mockResolvedValue({ id: "owner-1" });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r2",
          slug: "apiroom001",
          title: "Partner",
          kind: "instant",
          accessPolicy: "public",
        },
      ])
      .mockResolvedValueOnce([{ roomId: "r2", lobbyTitle: "Acme" }]);

    const res = await postV1(
      jsonRequest(
        "http://localhost/api/v1/instant-meetings",
        {
          title: "Partner",
          chronos_user_id: "cu-1",
          ui: { lobbyTitle: "Acme", themePreset: "emerald" },
        },
        { Authorization: "Bearer secret-token" },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("apiroom001");
    expect(body.url).toContain("/r/apiroom001");
    expect(body.kind).toBe("instant");
  });

  it("creates via session cookie", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "r3",
          slug: "sessroom01",
          title: "Quick",
          kind: "instant",
          accessPolicy: "public",
        },
      ])
      .mockResolvedValueOnce([{ roomId: "r3" }]);

    const res = await postV1(
      jsonRequest("http://localhost/api/v1/instant-meetings", { title: "Quick" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("sessroom01");
  });
});
