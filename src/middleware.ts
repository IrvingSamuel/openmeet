import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

/**
 * next start -H 127.0.0.1 -p 3331 makes Next build request.url as
 * http://localhost:3331/… (or public host + :3331 via x-forwarded-port).
 * next-intl then redirects to that absolute URL. Rewrite Location to the
 * public origin (NEXT_PUBLIC_APP_URL / x-forwarded-host).
 */
function publicOrigin(req: NextRequest): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      /* fall through */
    }
  }
  const proto = (
    req.headers.get("x-forwarded-proto") ||
    req.nextUrl.protocol.replace(/:$/, "") ||
    "https"
  )
    .split(",")[0]!
    .trim();
  const host = (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "meet.chronos.com.pt"
  )
    .split(",")[0]!
    .trim()
    // Drop accidental listen-port leakage (Next may set x-forwarded-port=3331).
    .replace(/:3331$/, "");
  return new URL(`${proto}://${host}`);
}

function needsPublicRewrite(loc: URL, pub: URL): boolean {
  if (loc.origin === pub.origin) return false;
  if (
    loc.hostname === "localhost" ||
    loc.hostname === "127.0.0.1" ||
    loc.hostname === "::1"
  ) {
    return true;
  }
  if (loc.port === "3331") return true;
  return loc.hostname === pub.hostname && loc.port !== pub.port;
}

function rewriteAbsoluteLocation(
  response: NextResponse,
  req: NextRequest,
): NextResponse {
  const location = response.headers.get("location");
  if (!location) return response;

  try {
    const loc = new URL(location, req.url);
    const pub = publicOrigin(req);
    if (!needsPublicRewrite(loc, pub)) return response;
    const fixed = new URL(
      `${loc.pathname}${loc.search}${loc.hash}`,
      pub.origin,
    );
    response.headers.set("location", fixed.toString());
  } catch {
    /* keep original Location */
  }
  return response;
}

export default function middleware(req: NextRequest) {
  return rewriteAbsoluteLocation(handleI18n(req), req);
}

export const config = {
  // Skip API, brand asset files, Next internals, static files, service worker, offline shell.
  matcher: [
    "/((?!api|brand-assets|_next|_vercel|sw\\.js|~offline|.*\\..*).*)",
  ],
};
