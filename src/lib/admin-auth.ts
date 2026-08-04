import type { SessionData } from "@/lib/session";

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

/** True when the session email is listed in ADMIN_EMAILS. */
export function isAdmin(
  session: Pick<SessionData, "isLoggedIn" | "email">,
  envEmails = process.env.ADMIN_EMAILS,
): boolean {
  if (!session.isLoggedIn || !session.email) return false;
  return parseAdminEmails(envEmails).has(session.email.trim().toLowerCase());
}
