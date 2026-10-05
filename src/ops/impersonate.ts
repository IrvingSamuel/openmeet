import { fillSessionFromUser, findUserById } from "@/lib/auth-users";
import { getSession } from "@/lib/session";

/**
 * Swap session to target user while remembering the admin.
 * Caller must already have verified admin + not-already-impersonating.
 */
export async function startImpersonation(targetUserId: string) {
  const session = await getSession();
  const target = await findUserById(targetUserId);
  if (!target) {
    return { ok: false as const, error: "user_not_found" };
  }

  const adminId = session.identityId || session.userId;
  const adminEmail = session.email;
  if (!adminId) {
    return { ok: false as const, error: "no_admin_identity" };
  }

  session.impersonatorIdentityId = adminId;
  session.impersonatorEmail = adminEmail;
  session.isLoggedIn = true;
  session.identityId = target.id;
  session.userId = target.id;
  session.email = target.email ?? undefined;
  session.name = target.name ?? undefined;
  session.avatarUrl = target.avatarUrl ?? undefined;
  session.role = target.role;
  await session.save();

  return {
    ok: true as const,
    target: {
      id: target.id,
      email: target.email,
      name: target.name,
    },
  };
}

/** Restore admin session from impersonator* fields. No isAdmin check. */
export async function stopImpersonation() {
  const session = await getSession();
  const adminId = session.impersonatorIdentityId;
  if (!adminId) {
    return { ok: false as const, error: "not_impersonating" };
  }

  const admin = await findUserById(adminId);
  if (!admin) {
    return { ok: false as const, error: "admin_not_found" };
  }

  await fillSessionFromUser(session, admin);
  return {
    ok: true as const,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  };
}
