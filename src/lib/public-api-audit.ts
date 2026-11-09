import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { publicApiRequestLogs } from "@/db/schema";
import {
  authorizePublicApi,
  type PublicApiAuthResult,
} from "@/lib/rooms";

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

export async function recordPublicApiRequest(args: {
  tokenId?: string | null;
  tokenName: string;
  tokenSource: "db" | "env" | "none";
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string | null;
  ownerIdentityId?: string | null;
}): Promise<void> {
  try {
    await db.insert(publicApiRequestLogs).values({
      tokenId: args.tokenId ?? null,
      tokenName: args.tokenName,
      tokenSource: args.tokenSource,
      method: args.method,
      path: args.path,
      statusCode: args.statusCode,
      durationMs: Math.max(0, Math.round(args.durationMs)),
      ip: args.ip ?? null,
      ownerIdentityId: args.ownerIdentityId ?? null,
    });
  } catch (err) {
    console.error("[openmeet] recordPublicApiRequest failed", err);
  }
}

export type AuthorizedPublicApiHandler = (
  auth: PublicApiAuthResult & { ok: true },
) => Promise<NextResponse>;

/**
 * Authorize a public API Bearer request, run the handler, and persist an access log.
 * Auth failures are logged as 401 with tokenName "(unauthorized)".
 */
export async function runAuthorizedPublicApi(
  req: NextRequest,
  handler: AuthorizedPublicApiHandler,
  options?: {
    unauthorizedResponse?: () => NextResponse;
  },
): Promise<NextResponse> {
  const started = Date.now();
  const method = req.method;
  const path = req.nextUrl.pathname;
  const ip = clientIp(req);

  const auth = await authorizePublicApi(req);
  if (!auth.ok) {
    const res =
      options?.unauthorizedResponse?.() ??
      NextResponse.json({ error: "unauthorized" }, { status: 401 });
    void recordPublicApiRequest({
      tokenName: "(unauthorized)",
      tokenSource: "none",
      method,
      path,
      statusCode: res.status,
      durationMs: Date.now() - started,
      ip,
    });
    return res;
  }

  try {
    const res = await handler(auth as PublicApiAuthResult & { ok: true });
    void recordPublicApiRequest({
      tokenId: auth.tokenId ?? null,
      tokenName: auth.tokenName ?? "unknown",
      tokenSource: auth.tokenSource ?? "db",
      method,
      path,
      statusCode: res.status,
      durationMs: Date.now() - started,
      ip,
      ownerIdentityId: auth.defaultOwnerId ?? null,
    });
    return res;
  } catch (err) {
    void recordPublicApiRequest({
      tokenId: auth.tokenId ?? null,
      tokenName: auth.tokenName ?? "unknown",
      tokenSource: auth.tokenSource ?? "db",
      method,
      path,
      statusCode: 500,
      durationMs: Date.now() - started,
      ip,
      ownerIdentityId: auth.defaultOwnerId ?? null,
    });
    throw err;
  }
}

/** Log a request that was already authorized (e.g. dual session/Bearer routes). */
export function auditAuthorizedRequest(
  req: NextRequest,
  auth: PublicApiAuthResult & { ok: true },
  res: NextResponse,
  started: number,
): void {
  void recordPublicApiRequest({
    tokenId: auth.tokenId ?? null,
    tokenName: auth.tokenName ?? "unknown",
    tokenSource: auth.tokenSource ?? "db",
    method: req.method,
    path: req.nextUrl.pathname,
    statusCode: res.status,
    durationMs: Date.now() - started,
    ip: clientIp(req),
    ownerIdentityId: auth.defaultOwnerId ?? null,
  });
}
