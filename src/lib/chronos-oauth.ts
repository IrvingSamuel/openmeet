import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chronosIdentities } from "@/db/schema";

const issuer = () => process.env.CHRONOS_OAUTH_ISSUER || "https://chronos.com.pt";

/** Clock skew before treating an access token as expired. */
const EXPIRY_SKEW_MS = 60_000;

export class ChronosAuthError extends Error {
  constructor(public readonly code: "reauth_required" | "no_identity") {
    super(code);
    this.name = "ChronosAuthError";
  }
}

export function getOAuthConfig() {
  const clientId = process.env.CHRONOS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CHRONOS_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.CHRONOS_OAUTH_REDIRECT_URI ||
    "https://meet.chronos.com.pt/api/auth/callback/chronos";
  if (!clientId || !clientSecret) {
    throw new Error("CHRONOS_OAUTH_CLIENT_ID / CHRONOS_OAUTH_CLIENT_SECRET not set");
  }
  return {
    issuer: issuer(),
    clientId,
    clientSecret,
    redirectUri,
    authorizeUrl: `${issuer()}/oauth/authorize`,
    tokenUrl: `${issuer()}/oauth/token`,
    userinfoUrl: `${issuer()}/oauth/userinfo`,
    scopes: "openid profile email chronos:mcp",
  };
}

export function buildAuthorizeUrl(state: string) {
  const cfg = getOAuthConfig();
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", cfg.scopes);
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  id_token?: string;
  scope?: string;
};

export async function exchangeCode(code: string) {
  const cfg = getOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string) {
  const cfg = getOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function fetchUserInfo(accessToken: string) {
  const cfg = getOAuthConfig();
  const res = await fetch(cfg.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Userinfo failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
    preferred_username?: string;
  }>;
}

function isAccessTokenFresh(tokenExpiresAt: Date | null | undefined): boolean {
  if (!tokenExpiresAt) return false;
  return tokenExpiresAt.getTime() > Date.now() + EXPIRY_SKEW_MS;
}

/**
 * Returns a usable Chronos OAuth access token for the identity.
 * Refreshes when expired. Throws ChronosAuthError("reauth_required") when
 * the user must sign in again (e.g. missing chronos:mcp scope).
 */
export async function getValidAccessToken(identityId: string): Promise<string> {
  const identity = await db.query.chronosIdentities.findFirst({
    where: eq(chronosIdentities.id, identityId),
  });
  if (!identity) {
    throw new ChronosAuthError("no_identity");
  }

  if (identity.accessToken && isAccessTokenFresh(identity.tokenExpiresAt)) {
    return identity.accessToken;
  }

  if (!identity.refreshToken) {
    throw new ChronosAuthError("reauth_required");
  }

  let tokens: TokenResponse;
  try {
    tokens = await refreshAccessToken(identity.refreshToken);
  } catch {
    throw new ChronosAuthError("reauth_required");
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await db
    .update(chronosIdentities)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? identity.refreshToken,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(chronosIdentities.id, identityId));

  return tokens.access_token;
}
