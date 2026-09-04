import { NextRequest, NextResponse } from "next/server";
import { buildOidcAuthorizeUrl, isOidcEnabled, newOidcState } from "@/lib/oidc";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { needsSetup } from "@/lib/deployment-mode";

export async function GET(req: NextRequest) {
  try {
    if (await needsSetup()) {
      return NextResponse.json({ error: "setup_required" }, { status: 403 });
    }
    if (!isOidcEnabled()) {
      return NextResponse.json({ error: "oidc_disabled" }, { status: 400 });
    }
    const state = newOidcState();
    const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
    const res = NextResponse.redirect(buildOidcAuthorizeUrl(state));
    res.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    if (returnTo) {
      res.cookies.set("oauth_return_to", returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
    } else {
      res.cookies.set("oauth_return_to", "", { maxAge: 0, path: "/" });
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oidc config missing";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
