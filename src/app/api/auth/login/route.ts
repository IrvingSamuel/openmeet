import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/chronos-oauth";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { getSession } from "@/lib/session";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const state = nanoid(24);
    session.isLoggedIn = session.isLoggedIn || false;
    const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
    const res = NextResponse.redirect(buildAuthorizeUrl(state));
    res.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    if (returnTo) {
      res.cookies.set("oauth_return_to", returnTo, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
    } else {
      res.cookies.set("oauth_return_to", "", { maxAge: 0, path: "/" });
    }
    await session.save();
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth config missing";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
