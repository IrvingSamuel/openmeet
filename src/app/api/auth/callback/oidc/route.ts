import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccounts, users } from "@/db/schema";
import { fillSessionFromUser, findUserByEmail, findUserByExternalId } from "@/lib/auth-users";
import {
  getDeploymentMode,
  isSignupAllowed,
  needsSetup,
} from "@/lib/deployment-mode";
import {
  exchangeOidcCode,
  fetchOidcUserInfo,
  isOidcEnabled,
} from "@/lib/oidc";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin-auth";

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is required");
  return url;
}

export async function GET(req: NextRequest) {
  const base = (() => {
    try {
      return appUrl();
    } catch {
      return "";
    }
  })();

  try {
    if (await needsSetup()) {
      return NextResponse.redirect(`${base}/setup?error=setup_required`);
    }
    if (!isOidcEnabled()) {
      return NextResponse.redirect(`${base}/login?error=oidc_disabled`);
    }

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const stored = req.cookies.get("oauth_state")?.value;
    const returnTo = sanitizeReturnTo(req.cookies.get("oauth_return_to")?.value) || "/dashboard";

    if (!code || !state || !stored || state !== stored) {
      return NextResponse.redirect(`${base}/login?error=oauth_state`);
    }

    const tokens = await exchangeOidcCode(code);
    const info = await fetchOidcUserInfo(tokens.access_token);
    if (!info.sub) {
      return NextResponse.redirect(`${base}/login?error=oauth_failed`);
    }

    let user = await findUserByExternalId(info.sub);
    if (!user && info.email) {
      user = (await findUserByEmail(info.email)) ?? undefined;
    }

    const mode = await getDeploymentMode();

    if (!user) {
      if (mode === "server") {
        // Only allow if ADMIN_EMAILS matches (pre-approved admin email)
        const fakeSession = {
          isLoggedIn: true,
          email: info.email,
          role: "user" as const,
        };
        if (!info.email || !isAdmin(fakeSession)) {
          return NextResponse.redirect(`${base}/login?error=server_mode_invite_only`);
        }
      } else if (!(await isSignupAllowed())) {
        return NextResponse.redirect(`${base}/login?error=signup_disabled`);
      }

      const [created] = await db
        .insert(users)
        .values({
          email: info.email?.trim().toLowerCase() || null,
          name: info.name || info.email?.split("@")[0] || "User",
          avatarUrl: info.picture || null,
          externalId: info.sub,
          role: mode === "server" ? "admin" : "user",
          createdVia: "oidc",
        })
        .returning();
      user = created;
    } else {
      await db
        .update(users)
        .set({
          externalId: user.externalId || info.sub,
          name: info.name || user.name,
          avatarUrl: info.picture || user.avatarUrl,
          email: info.email?.trim().toLowerCase() || user.email,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      user = (await findUserByExternalId(info.sub)) || user;
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    const existingAccount = await db.query.oauthAccounts.findFirst({
      where: eq(oauthAccounts.subject, info.sub),
    });
    if (existingAccount) {
      await db
        .update(oauthAccounts)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || existingAccount.refreshToken,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(oauthAccounts.id, existingAccount.id));
    } else {
      await db.insert(oauthAccounts).values({
        userId: user.id,
        provider: "oidc",
        subject: info.sub,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiresAt: expiresAt,
      });
    }

    const session = await getSession();
    await fillSessionFromUser(session, user);

    const res = NextResponse.redirect(`${base}${returnTo}`);
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("oauth_return_to", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    console.error("OIDC callback error", e);
    return NextResponse.redirect(`${base || "/"}/login?error=oauth_failed`);
  }
}
