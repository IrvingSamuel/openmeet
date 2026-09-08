import { eq } from "drizzle-orm";
import type { IronSession } from "iron-session";
import { db } from "@/db";
import { users, type UserRole } from "@/db/schema";
import type { SessionData } from "@/lib/session";

export async function fillSessionFromUser(
  session: IronSession<SessionData>,
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    role: string;
  },
) {
  session.isLoggedIn = true;
  session.identityId = user.id;
  session.userId = user.id;
  session.email = user.email ?? undefined;
  session.name = user.name ?? undefined;
  session.avatarUrl = user.avatarUrl ?? undefined;
  session.role = user.role as UserRole;
  await session.save();
}

export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return db.query.users.findFirst({
    where: eq(users.email, normalized),
  });
}

export async function findUserById(id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}

export async function findUserByExternalId(externalId: string) {
  return db.query.users.findFirst({
    where: eq(users.externalId, externalId),
  });
}
