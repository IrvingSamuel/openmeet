import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { UserRole } from "@/db/schema";

export type SessionData = {
  /** Internal user UUID (legacy name kept for hostAuth / ownership checks). */
  identityId?: string;
  userId?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  role?: UserRole | string;
  isLoggedIn: boolean;
};

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return {
    password,
    cookieName: "openmeet_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export function sessionUserId(session: SessionData): string | undefined {
  return session.userId || session.identityId;
}
