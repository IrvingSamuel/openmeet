import { nanoid } from "nanoid";

export type OidcConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
};

export function getOidcConfig(): OidcConfig | null {
  const enabled =
    process.env.OIDC_ENABLED === "true" || process.env.OIDC_ENABLED === "1";
  if (!enabled) return null;

  const issuer = (process.env.OIDC_ISSUER || "").replace(/\/$/, "");
  const clientId = process.env.OIDC_CLIENT_ID || "";
  const clientSecret = process.env.OIDC_CLIENT_SECRET || "";
  const redirectUri =
    process.env.OIDC_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/api/auth/callback/oidc`;
  const scopes = process.env.OIDC_SCOPES || "openid profile email";

  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    throw new Error("OIDC enabled but OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI incomplete");
  }

  return { enabled: true, issuer, clientId, clientSecret, redirectUri, scopes };
}

export function isOidcEnabled(): boolean {
  try {
    return Boolean(getOidcConfig());
  } catch {
    return false;
  }
}

export function buildOidcAuthorizeUrl(state: string): string {
  const cfg = getOidcConfig();
  if (!cfg) throw new Error("OIDC not configured");
  const authorizePath = process.env.OIDC_AUTHORIZE_PATH || "/authorize";
  const base = new URL(
    cfg.issuer + (authorizePath.startsWith("/") ? authorizePath : `/${authorizePath}`),
  );
  base.searchParams.set("response_type", "code");
  base.searchParams.set("client_id", cfg.clientId);
  base.searchParams.set("redirect_uri", cfg.redirectUri);
  base.searchParams.set("scope", cfg.scopes);
  base.searchParams.set("state", state);
  return base.toString();
}

export async function exchangeOidcCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}> {
  const cfg = getOidcConfig();
  if (!cfg) throw new Error("OIDC not configured");
  const tokenPath = process.env.OIDC_TOKEN_PATH || "/token";
  const tokenUrl = `${cfg.issuer}${tokenPath.startsWith("/") ? tokenPath : `/${tokenPath}`}`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export type OidcUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export async function fetchOidcUserInfo(accessToken: string): Promise<OidcUserInfo> {
  const cfg = getOidcConfig();
  if (!cfg) throw new Error("OIDC not configured");
  const userinfoPath = process.env.OIDC_USERINFO_PATH || "/userinfo";
  const url = `${cfg.issuer}${userinfoPath.startsWith("/") ? userinfoPath : `/${userinfoPath}`}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC userinfo failed: ${res.status} ${text}`);
  }
  return res.json();
}

export function newOidcState(): string {
  return nanoid(24);
}
