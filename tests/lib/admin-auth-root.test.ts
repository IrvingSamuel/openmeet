import { beforeEach, describe, expect, it, vi } from "vitest";

const findUserById = vi.fn();

vi.mock("@/lib/auth-users", () => ({
  findUserById: (...args: unknown[]) => findUserById(...args),
}));

import {
  isLocalRoot,
  isLocalRootUser,
  resolveActorUserId,
} from "@/lib/admin-auth";

describe("local root gate", () => {
  beforeEach(() => {
    findUserById.mockReset();
  });

  it("recognizes setup users as local root", () => {
    expect(isLocalRootUser({ createdVia: "setup" })).toBe(true);
    expect(isLocalRootUser({ createdVia: "local" })).toBe(false);
    expect(isLocalRootUser({ createdVia: "oidc" })).toBe(false);
  });

  it("prefers impersonator id as the actor", () => {
    expect(
      resolveActorUserId({
        impersonatorIdentityId: "root-1",
        identityId: "tenant-2",
        userId: "tenant-2",
      }),
    ).toBe("root-1");
    expect(
      resolveActorUserId({
        identityId: "user-3",
        userId: "user-3",
      }),
    ).toBe("user-3");
  });

  it("isLocalRoot true only for setup actor", async () => {
    findUserById.mockResolvedValue({ id: "root-1", createdVia: "setup" });
    await expect(
      isLocalRoot({
        isLoggedIn: true,
        identityId: "root-1",
        userId: "root-1",
      }),
    ).resolves.toBe(true);

    findUserById.mockResolvedValue({ id: "admin-2", createdVia: "local" });
    await expect(
      isLocalRoot({
        isLoggedIn: true,
        identityId: "admin-2",
        userId: "admin-2",
      }),
    ).resolves.toBe(false);
  });

  it("isLocalRoot uses impersonator when present", async () => {
    findUserById.mockResolvedValue({ id: "root-1", createdVia: "setup" });
    await expect(
      isLocalRoot({
        isLoggedIn: true,
        impersonatorIdentityId: "root-1",
        identityId: "tenant-9",
        userId: "tenant-9",
      }),
    ).resolves.toBe(true);
    expect(findUserById).toHaveBeenCalledWith("root-1");
  });

  it("isLocalRoot false when logged out", async () => {
    await expect(
      isLocalRoot({ isLoggedIn: false }),
    ).resolves.toBe(false);
    expect(findUserById).not.toHaveBeenCalled();
  });
});
