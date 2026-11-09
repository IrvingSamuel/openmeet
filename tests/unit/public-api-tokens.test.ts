// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAppSettings = vi.fn();
const invalidateAppSettingsCache = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
const insertValues = vi.fn();
const insertReturning = vi.fn();
const updateSet = vi.fn();

vi.mock("@/lib/app-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/app-settings")>(
    "@/lib/app-settings",
  );
  return {
    ...actual,
    ensureAppSettings: (...args: unknown[]) => ensureAppSettings(...args),
    invalidateAppSettingsCache: (...args: unknown[]) =>
      invalidateAppSettingsCache(...args),
  };
});

vi.mock("@/db", () => ({
  db: {
    query: {
      publicApiTokens: {
        findFirst: (...args: unknown[]) => findFirst(...args),
        findMany: (...args: unknown[]) => findMany(...args),
      },
    },
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v);
        return {
          returning: () => insertReturning(),
        };
      },
    }),
    update: () => ({
      set: (v: unknown) => {
        updateSet(v);
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  },
}));

import {
  migrateLegacyPublicApiToken,
  resetLegacyPublicApiTokenMigration,
} from "@/lib/public-api-tokens";
import { authorizePublicApi } from "@/lib/rooms";

beforeEach(() => {
  resetLegacyPublicApiTokenMigration();
  ensureAppSettings.mockReset();
  invalidateAppSettingsCache.mockReset();
  findFirst.mockReset();
  findMany.mockReset();
  insertValues.mockReset();
  insertReturning.mockReset();
  updateSet.mockReset();
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(undefined);
  delete process.env.MEET_MCP_TOKEN;
});

describe("migrateLegacyPublicApiToken", () => {
  it("migrates legacy app_settings token as Chronos", async () => {
    ensureAppSettings.mockResolvedValue({
      publicApiToken: "legacy-secret-token-9SH4",
      publicApiTokenCreatedAt: new Date("2026-06-10T16:46:21.000Z"),
      publicApiTokenOwnerId: "admin-1",
    });
    findFirst.mockResolvedValue(undefined);

    await migrateLegacyPublicApiToken();

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Chronos",
        token: "legacy-secret-token-9SH4",
        ownerIdentityId: "admin-1",
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        publicApiToken: null,
        publicApiTokenCreatedAt: null,
        publicApiTokenOwnerId: null,
      }),
    );
  });

  it("skips when no legacy token", async () => {
    ensureAppSettings.mockResolvedValue({
      publicApiToken: null,
    });
    await migrateLegacyPublicApiToken();
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe("authorizePublicApi multi-token", () => {
  it("matches one of several active tokens by name attribution", async () => {
    findMany.mockResolvedValue([
      {
        id: "t1",
        name: "Chronos",
        token: "token-chronos",
        tokenPreview: "••••onos",
        ownerIdentityId: "owner-a",
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      },
      {
        id: "t2",
        name: "CRM",
        token: "token-crm",
        tokenPreview: "••••-crm",
        ownerIdentityId: "owner-b",
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      },
    ]);

    // listActivePublicApiTokens is not mocked here — authorize uses real
    // listActivePublicApiTokens which calls findMany after migrate.
    // migrate will call ensureAppSettings — provide empty legacy.
    ensureAppSettings.mockResolvedValue({ publicApiToken: null });

    const chronos = await authorizePublicApi({
      headers: { get: (n: string) => (n === "Authorization" ? "Bearer token-chronos" : null) },
    });
    expect(chronos).toMatchObject({
      ok: true,
      tokenId: "t1",
      tokenName: "Chronos",
      defaultOwnerId: "owner-a",
      tokenSource: "db",
    });

    const crm = await authorizePublicApi({
      headers: { get: (n: string) => (n === "Authorization" ? "Bearer token-crm" : null) },
    });
    expect(crm).toMatchObject({
      ok: true,
      tokenId: "t2",
      tokenName: "CRM",
      tokenSource: "db",
    });
  });

  it("falls back to MEET_MCP_TOKEN env", async () => {
    ensureAppSettings.mockResolvedValue({ publicApiToken: null });
    findMany.mockResolvedValue([]);
    process.env.MEET_MCP_TOKEN = "env-secret";

    const auth = await authorizePublicApi({
      headers: { get: (n: string) => (n === "Authorization" ? "Bearer env-secret" : null) },
    });
    expect(auth).toMatchObject({
      ok: true,
      tokenName: "MEET_MCP_TOKEN",
      tokenSource: "env",
      tokenId: null,
    });
  });
});
