import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const isAdmin = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));

vi.mock("@/lib/admin-auth", () => ({
  isAdmin: (...args: unknown[]) => isAdmin(...args),
}));

import { requireOpsAdmin } from "@/ops/auth";

describe("requireOpsAdmin", () => {
  beforeEach(() => {
    getSession.mockReset();
    isAdmin.mockReset();
  });

  it("rejects logged-out sessions", async () => {
    getSession.mockResolvedValue({ isLoggedIn: false });
    isAdmin.mockReturnValue(false);
    const result = await requireOpsAdmin();
    expect(result).toHaveProperty("error");
    expect(result.error?.status).toBe(401);
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it("rejects non-admin sessions", async () => {
    getSession.mockResolvedValue({
      isLoggedIn: true,
      email: "user@example.com",
      role: "member",
    });
    isAdmin.mockReturnValue(false);
    const result = await requireOpsAdmin();
    expect(result).toHaveProperty("error");
    expect(result.error?.status).toBe(403);
  });

  it("allows any server admin (role or ADMIN_EMAILS)", async () => {
    const session = {
      isLoggedIn: true,
      email: "admin@example.com",
      role: "admin",
    };
    getSession.mockResolvedValue(session);
    isAdmin.mockReturnValue(true);
    const result = await requireOpsAdmin();
    expect(result).toEqual({ session });
    expect(isAdmin).toHaveBeenCalledWith(session);
  });
});
