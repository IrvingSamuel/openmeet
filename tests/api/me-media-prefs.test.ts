// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};
const findFirst = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      identityMediaPrefs: {
        findFirst: (...args: unknown[]) => findFirst(...args),
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

import { GET, PATCH } from "@/app/api/me/media-prefs/route";

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  findFirst.mockReset();
  insertReturning.mockReset();
  updateReturning.mockReset();
});

describe("GET /api/me/media-prefs", () => {
  it("rejects anonymous", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("creates defaults when missing", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    findFirst.mockResolvedValue(undefined);
    insertReturning.mockResolvedValue([
      {
        identityId: "id-1",
        videoEffect: "none",
        blurRadius: 10,
        virtualBackgroundUrl: null,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs.videoEffect).toBe("none");
    expect(body.prefs.noiseSuppression).toBe(true);
  });
});

describe("PATCH /api/me/media-prefs", () => {
  it("updates existing prefs", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    findFirst.mockResolvedValue({ identityId: "id-1" });
    updateReturning.mockResolvedValue([
      {
        identityId: "id-1",
        videoEffect: "blur",
        blurRadius: 14,
        virtualBackgroundUrl: null,
        noiseSuppression: false,
        echoCancellation: true,
        autoGainControl: true,
      },
    ]);
    const res = await PATCH(
      new Request("http://localhost/api/me/media-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoEffect: "blur", blurRadius: 14, noiseSuppression: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs.videoEffect).toBe("blur");
    expect(body.prefs.blurRadius).toBe(14);
    expect(body.prefs.noiseSuppression).toBe(false);
  });

  it("rejects invalid body", async () => {
    session.isLoggedIn = true;
    session.identityId = "id-1";
    const res = await PATCH(
      new Request("http://localhost/api/me/media-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoEffect: "sparkle" }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    expect(res.status).toBe(400);
  });
});
