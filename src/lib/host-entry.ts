import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type HostEntryCookie = {
  meetingId?: string;
  displayName?: string;
  /** Epoch ms when the entry grant was issued. */
  issuedAt?: number;
  isHost: boolean;
};

const COOKIE_NAME = "om_host_entry";
const MAX_AGE_SEC = 60 * 60 * 12; // 12h

/** Public site origin for absolute links/redirects (never listen-host/localhost). */
export function publicOrigin(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL is required");
  }
  return url;
}

export function generateHostEntryToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHostEntryToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyHostEntryToken(
  token: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash || !token) return false;
  const hash = hashHostEntryToken(token);
  try {
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function meetingHostEnterUrl(
  meetingId: string,
  token: string,
  displayName?: string,
): { hostUrl: string; hostPath: string } {
  const params = new URLSearchParams({ token });
  if (displayName?.trim()) {
    params.set("display_name", displayName.trim().slice(0, 80));
  }
  const hostPath = `/api/v1/meetings/${meetingId}/enter?${params.toString()}`;
  return { hostPath, hostUrl: `${publicOrigin()}${hostPath}` };
}

function hostEntrySessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return {
    password,
    cookieName: COOKIE_NAME,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SEC,
    },
  };
}

export async function getHostEntrySession() {
  return getIronSession<HostEntryCookie>(
    await cookies(),
    hostEntrySessionOptions(),
  );
}

export async function setHostEntryGrant(opts: {
  meetingId: string;
  displayName?: string;
}): Promise<void> {
  const session = await getHostEntrySession();
  session.meetingId = opts.meetingId;
  session.displayName = opts.displayName;
  session.issuedAt = Date.now();
  session.isHost = true;
  await session.save();
}

export async function clearHostEntryGrant(): Promise<void> {
  const session = await getHostEntrySession();
  session.destroy();
}

/** True when the browser holds a valid host-entry grant for this meeting. */
export async function hasHostEntryGrant(meetingId: string): Promise<boolean> {
  const session = await getHostEntrySession();
  if (!session.isHost || session.meetingId !== meetingId) return false;
  if (session.issuedAt && Date.now() - session.issuedAt > MAX_AGE_SEC * 1000) {
    return false;
  }
  return true;
}

export async function hostEntryDisplayName(
  meetingId: string,
): Promise<string | undefined> {
  const session = await getHostEntrySession();
  if (!session.isHost || session.meetingId !== meetingId) return undefined;
  return session.displayName;
}

/** Validate absolute http(s) redirect URL for post-meet return. */
export function parseRedirectAfterMeet(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = value.trim();
  if (trimmed.length > 2000) {
    throw new Error("redirect_after_meet_too_long");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("redirect_after_meet_invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("redirect_after_meet_invalid");
  }
  return url.toString();
}
