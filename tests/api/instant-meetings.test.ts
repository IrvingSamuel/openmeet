// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { isLoggedIn: false, identityId: undefined as string | undefined };
const identityBrandsFindFirst = vi.fn();
const insertReturning = vi.fn();
const usersFindFirst = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      identityBrands: {
        findFirst: (...args: unknown[]) => identityBrandsFindFirst(...args),
      },
      roomBrands: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      rooms: {
        findFirst: vi.fn(),
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
  insertReturning.mockReset();
  usersFindFirst.mockReset();
  identityBrandsFindFirst.mockResolvedValue(undefined);
  delete process.env.MEET_MCP_TOKEN;
  delete process.env.AGENT_SHARED_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = "https://openmeet.chronos.com.pt";
});

describe("POST /api/rooms/instant", () => {
  it("rejects anonymous", async () => {
    const res = await postInstant(jsonRequest("http://localhost/api/rooms/instant", {}));
    expect(res.status).toBe(401);
  });

  it("creates a meeting with /m join url", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "m1",
          slug: "inst123456",
          title: "Instant",
          accessPolicy: "public",
          roomId: null,
        },
      ])
      .mockResolvedValueOnce([{ meetingId: "m1" }]);

    const res = await postInstant(
      jsonRequest("http://localhost/api/rooms/instant", { title: "Instant" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.meeting_id).toBe("m1");
    expect(body.url).toContain("/m/inst123456");
    expect(body.join_path).toBe("/m/inst123456");
  });
});

describe("POST /api/v1/instant-meetings", () => {
  it("rejects without auth", async () => {
    const res = await postV1(
      jsonRequest("http://localhost/api/v1/instant-meetings", { title: "X" }),
    );
    expect(res.status).toBe(401);
  });

  it("creates via bearer + chronos_user_id", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    usersFindFirst.mockResolvedValue({ id: "owner-1" });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "m2",
          slug: "apiroom001",
          title: "Partner",
          accessPolicy: "public",
          roomId: null,
        },
      ])
      .mockResolvedValueOnce([{ meetingId: "m2" }]);

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
    expect(body.url).toContain("/m/apiroom001");
    expect(body.meeting_id).toBe("m2");
    expect(body.empty_timeout_sec).toBe(300);
  });

  it("accepts empty_timeout_sec override", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    usersFindFirst.mockResolvedValue({ id: "owner-1" });
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "m4",
          slug: "holdroom01",
          title: "Hold",
          accessPolicy: "public",
          roomId: null,
          emptyTimeoutSec: 1800,
        },
      ])
      .mockResolvedValueOnce([{ meetingId: "m4" }]);

    const res = await postV1(
      jsonRequest(
        "http://localhost/api/v1/instant-meetings",
        {
          title: "Hold",
          chronos_user_id: "cu-1",
          empty_timeout_sec: 1800,
        },
        { Authorization: "Bearer secret-token" },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.empty_timeout_sec).toBe(1800);
  });

  it("rejects empty_timeout_sec out of range", async () => {
    process.env.MEET_MCP_TOKEN = "secret-token";
    usersFindFirst.mockResolvedValue({ id: "owner-1" });

    const res = await postV1(
      jsonRequest(
        "http://localhost/api/v1/instant-meetings",
        {
          title: "Bad",
          chronos_user_id: "cu-1",
          empty_timeout_sec: 10,
        },
        { Authorization: "Bearer secret-token" },
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("empty_timeout_sec_out_of_range");
  });

  it("creates via session cookie", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    insertReturning
      .mockResolvedValueOnce([
        {
          id: "m3",
          slug: "sessroom01",
          title: "Quick",
          accessPolicy: "public",
          roomId: null,
        },
      ])
      .mockResolvedValueOnce([{ meetingId: "m3" }]);

    const res = await postV1(
      jsonRequest("http://localhost/api/v1/instant-meetings", { title: "Quick" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("sessroom01");
    expect(body.join_path).toBe("/m/sessroom01");
  });
});
