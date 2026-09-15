import type { UserCreatedVia } from "@/db/schema";
import { findUserById } from "@/lib/auth-users";
import type { SessionData } from "@/lib/session";
import { sessionUserId } from "@/lib/session";

/** Parse ADMIN_EMAILS (comma-separated) into a normalized lowercase set. */
export function parseAdminEmails(raw?: string | null): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Admin if DB role is admin, or email is listed in ADMIN_EMAILS (override).
 */
export function isAdmin(
  session: Pick<SessionData, "isLoggedIn" | "email" | "role">,
  envEmails = process.env.ADMIN_EMAILS,
): boolean {
  if (!session.isLoggedIn) return false;
  if (session.role === "admin") return true;
  if (!session.email) return false;
  return parseAdminEmails(envEmails).has(session.email.trim().toLowerCase());
}

/** Bootstrap admin created during /setup — the only local root. */
export function isLocalRootUser(user: {
  createdVia?: UserCreatedVia | string | null;
}): boolean {
  return user.createdVia === "setup";
}

/**
 * Real actor for ops checks: the impersonating root when present,
 * otherwise the logged-in user.
 */
export function resolveActorUserId(
  session: Pick<
    SessionData,
    "impersonatorIdentityId" | "identityId" | "userId"
  >,
): string | undefined {
  return (
    session.impersonatorIdentityId ||
    sessionUserId(session as SessionData) ||
    undefined
  );
}

/**
 * True only for the bootstrap setup admin (createdVia=setup).
 * Granted admins and ADMIN_EMAILS overrides do not qualify.
 */
export async function isLocalRoot(
  session: Pick<
    SessionData,
    | "isLoggedIn"
    | "impersonatorIdentityId"
    | "identityId"
    | "userId"
  >,
): Promise<boolean> {
  if (!session.isLoggedIn) return false;
  const actorId = resolveActorUserId(session);
  if (!actorId) return false;
  const user = await findUserById(actorId);
  if (!user) return false;
  return isLocalRootUser(user);
}
