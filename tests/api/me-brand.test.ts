// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { isLoggedIn: false, identityId: undefined as string | undefined };
const identityBrandsFindFirst = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      identityBrands: {
        findFirst: (...args: unknown[]) => identityBrandsFindFirst(...args),
      },
    },
    insert: () => ({
      values: () => ({ returning: () => insertReturning() }),
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

import { GET, PATCH } from "@/app/api/me/brand/route";

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  identityBrandsFindFirst.mockReset();
  insertReturning.mockReset();
  updateReturning.mockReset();
});

describe("GET /api/me/brand", () => {
  it("rejects anonymous", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("creates a default brand when missing", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    identityBrandsFindFirst.mockResolvedValue(undefined);
    insertReturning.mockResolvedValue([
      { identityId: "id-1", themePreset: "violet" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brand.themePreset).toBe("violet");
    expect(body.themes).toBeTruthy();
  });
});

describe("PATCH /api/me/brand", () => {
  it("updates an existing brand", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    identityBrandsFindFirst.mockResolvedValue({ identityId: "id-1" });
    updateReturning.mockResolvedValue([
      { identityId: "id-1", lobbyTitle: "Acme" },
    ]);
    const res = await PATCH(
      new Request("http://localhost/api/me/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyTitle: "Acme" }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brand.lobbyTitle).toBe("Acme");
  });
});
