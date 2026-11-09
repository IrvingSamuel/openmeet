// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
  email: undefined as string | undefined,
};

const findActiveTokenByName = vi.fn();
const listActivePublicApiTokens = vi.fn();
const migrateLegacyPublicApiToken = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn();
const requireOpsAdmin = vi.fn();
const listOpsApiRequests = vi.fn();
const listOpsApiTokenFilters = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
  sessionUserId: (s: typeof session) => s.identityId ?? null,
}));

vi.mock("@/lib/admin-auth", () => ({
  isAdmin: (s: typeof session) =>
    Boolean(s.isLoggedIn && s.email === "admin@chronos.com.pt"),
}));

vi.mock("@/lib/public-api-tokens", () => ({
  findActiveTokenByName: (...args: unknown[]) => findActiveTokenByName(...args),
  listActivePublicApiTokens: (...args: unknown[]) =>
    listActivePublicApiTokens(...args),
  migrateLegacyPublicApiToken: (...args: unknown[]) =>
    migrateLegacyPublicApiToken(...args),
  toPublicApiTokenPublic: (row: {
    id: string;
    name: string;
    tokenPreview: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    ownerIdentityId: string | null;
  }) => ({
    id: row.id,
    name: row.name,
    preview: row.tokenPreview,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    ownerIdentityId: row.ownerIdentityId ?? null,
  }),
}));

vi.mock("@/ops/auth", () => ({
  requireOpsAdmin: (...args: unknown[]) => requireOpsAdmin(...args),
}));

vi.mock("@/ops/api-requests", () => ({
  listOpsApiRequests: (...args: unknown[]) => listOpsApiRequests(...args),
  listOpsApiTokenFilters: (...args: unknown[]) =>
    listOpsApiTokenFilters(...args),
}));

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: () => insertReturning(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => updateReturning(),
        }),
      }),
    }),
  },
}));

import {
  GET as listTokens,
  POST as createToken,
} from "@/app/api/admin/settings/api-tokens/route";
import { DELETE as revokeToken } from "@/app/api/admin/settings/api-tokens/[id]/route";
import { GET as opsApiRequests } from "@/app/api/ops/api-requests/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/settings/api-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  session.email = undefined;
  findActiveTokenByName.mockReset();
  listActivePublicApiTokens.mockReset();
  migrateLegacyPublicApiToken.mockReset();
  insertReturning.mockReset();
  updateReturning.mockReset();
  requireOpsAdmin.mockReset();
  listOpsApiRequests.mockReset();
  listOpsApiTokenFilters.mockReset();
  migrateLegacyPublicApiToken.mockResolvedValue(undefined);
  findActiveTokenByName.mockResolvedValue(undefined);
  listActivePublicApiTokens.mockResolvedValue([]);
});

describe("POST /api/admin/settings/api-tokens", () => {
  it("creates two named tokens", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    session.identityId = "admin-1";

    insertReturning
      .mockResolvedValueOnce([
        {
          id: "tok-1",
          name: "Chronos",
          token: "aaa",
          tokenPreview: "••••aaa",
          ownerIdentityId: "admin-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          revokedAt: null,
          lastUsedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "tok-2",
          name: "CRM",
          token: "bbb",
          tokenPreview: "••••bbb",
          ownerIdentityId: "admin-1",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          revokedAt: null,
          lastUsedAt: null,
        },
      ]);

    const r1 = await createToken(jsonRequest({ name: "Chronos" }));
    expect(r1.status).toBe(200);
    const b1 = await r1.json();
    expect(b1.name).toBe("Chronos");
    expect(b1.token).toBeTruthy();

    const r2 = await createToken(jsonRequest({ name: "CRM" }));
    expect(r2.status).toBe(200);
    const b2 = await r2.json();
    expect(b2.name).toBe("CRM");
    expect(b2.id).not.toBe(b1.id);
  });

  it("rejects duplicate active name", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    session.identityId = "admin-1";
    findActiveTokenByName.mockResolvedValue({ id: "existing", name: "Chronos" });

    const res = await createToken(jsonRequest({ name: "Chronos" }));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/admin/settings/api-tokens/[id]", () => {
  it("soft-revokes a token", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    session.identityId = "admin-1";
    updateReturning.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        revokedAt: new Date(),
      },
    ]);

    const res = await revokeToken(
      new Request("http://localhost") as never,
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(true);
  });
});

describe("GET /api/admin/settings/api-tokens", () => {
  it("lists active tokens for admin", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    session.identityId = "admin-1";
    listActivePublicApiTokens.mockResolvedValue([
      {
        id: "tok-1",
        name: "Chronos",
        token: "secret",
        tokenPreview: "••••cret",
        ownerIdentityId: "admin-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        revokedAt: null,
        lastUsedAt: null,
      },
    ]);

    const res = await listTokens();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0].name).toBe("Chronos");
    expect(body.tokens[0].preview).toBe("••••cret");
    expect(body.tokens[0].token).toBeUndefined();
  });
});

describe("GET /api/ops/api-requests", () => {
  it("requires ops admin", async () => {
    requireOpsAdmin.mockResolvedValue({
      error: Response.json({ error: "forbidden" }, { status: 403 }),
    });
    const res = await opsApiRequests(
      new NextRequest("http://localhost/api/ops/api-requests"),
    );
    expect(res.status).toBe(403);
  });

  it("returns request log for admin", async () => {
    requireOpsAdmin.mockResolvedValue({ session });
    listOpsApiRequests.mockResolvedValue({
      items: [
        {
          id: "log-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          tokenId: "tok-1",
          tokenName: "Chronos",
          tokenSource: "db",
          method: "POST",
          path: "/api/v1/rooms",
          statusCode: 201,
          durationMs: 12,
          ip: "1.2.3.4",
          ownerIdentityId: "admin-1",
        },
      ],
      nextCursor: null,
    });
    listOpsApiTokenFilters.mockResolvedValue({ tokens: [] });

    const res = await opsApiRequests(
      new NextRequest("http://localhost/api/ops/api-requests"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].tokenName).toBe("Chronos");
    expect(body.items[0].path).toBe("/api/v1/rooms");
  });
});
