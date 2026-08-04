import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chronosIdentities } from "@/db/schema";
import { exchangeCode, fetchUserInfo } from "@/lib/chronos-oauth";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = req.cookies.get("oauth_state")?.value;
  const returnTo = sanitizeReturnTo(req.cookies.get("oauth_return_to")?.value);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://meet.chronos.com.pt";

  if (!code || !state || !stored || state !== stored) {
    return NextResponse.redirect(`${appUrl}/?error=oauth_state`);
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await fetchUserInfo(tokens.access_token);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    const existing = await db.query.chronosIdentities.findFirst({
      where: eq(chronosIdentities.chronosUserId, String(user.sub)),
    });

    let identityId: string;
    if (existing) {
      await db
        .update(chronosIdentities)
        .set({
          email: user.email ?? existing.email,
          name: user.name ?? existing.name,
          avatarUrl: user.picture ?? existing.avatarUrl,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? existing.refreshToken,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(chronosIdentities.id, existing.id));
      identityId = existing.id;
    } else {
      const [row] = await db
        .insert(chronosIdentities)
        .values({
          chronosUserId: String(user.sub),
          email: user.email,
          name: user.name,
          avatarUrl: user.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
        })
        .returning();
      identityId = row.id;
    }

    const session = await getSession();
    session.isLoggedIn = true;
    session.identityId = identityId;
    session.chronosUserId = String(user.sub);
    session.name = user.name;
    session.email = user.email;
    session.avatarUrl = user.picture;
    await session.save();

    const destination = returnTo ? `${appUrl}${returnTo}` : `${appUrl}/dashboard`;
    const res = NextResponse.redirect(destination);
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("oauth_return_to", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    console.error("OAuth callback error", e);
    return NextResponse.redirect(`${appUrl}/?error=oauth_failed`);
  }
}
