import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      chronosIdentities: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },
}));

import { db } from "@/db";
import {
  ChronosAuthError,
  getOAuthConfig,
  getValidAccessToken,
} from "@/lib/chronos-oauth";

const findFirst = db.query.chronosIdentities.findFirst as ReturnType<
  typeof vi.fn
>;
const update = db.update as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  process.env.CHRONOS_OAUTH_CLIENT_ID = "client-id";
  process.env.CHRONOS_OAUTH_CLIENT_SECRET = "client-secret";
});

describe("getOAuthConfig", () => {
  it("requests chronos:mcp alongside identity scopes", () => {
    expect(getOAuthConfig().scopes).toBe(
      "openid profile email chronos:mcp",
    );
  });
});

describe("getValidAccessToken", () => {
  it("returns a still-fresh access token without refreshing", async () => {
    findFirst.mockResolvedValue({
      id: "id-1",
      accessToken: "fresh-token",
      refreshToken: "refresh",
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    });

    await expect(getValidAccessToken("id-1")).resolves.toBe("fresh-token");
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes an expired access token and persists the result", async () => {
    findFirst.mockResolvedValue({
      id: "id-1",
      accessToken: "old-token",
      refreshToken: "refresh-token",
      tokenExpiresAt: new Date(Date.now() - 1000),
    });

    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    update.mockReturnValue({ set });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(getValidAccessToken("id-1")).resolves.toBe("new-token");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-token",
        refreshToken: "new-refresh",
      }),
    );
  });

  it("throws reauth_required when refresh is impossible", async () => {
    findFirst.mockResolvedValue({
      id: "id-1",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    });

    await expect(getValidAccessToken("id-1")).rejects.toMatchObject({
      code: "reauth_required",
    } satisfies Partial<ChronosAuthError>);
  });
});
