import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { publicApiRequestLogs } from "@/db/schema";
import {
  listActivePublicApiTokens,
  toPublicApiTokenPublic,
} from "@/lib/public-api-tokens";

export type OpsApiRequestRow = {
  id: string;
  createdAt: string;
  tokenId: string | null;
  tokenName: string;
  tokenSource: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string | null;
  ownerIdentityId: string | null;
};

export async function listOpsApiRequests(args: {
  tokenId?: string | null;
  q?: string | null;
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: OpsApiRequestRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const conditions = [];

  if (args.tokenId) {
    conditions.push(eq(publicApiRequestLogs.tokenId, args.tokenId));
  }

  const q = args.q?.trim();
  if (q) {
    conditions.push(
      or(
        ilike(publicApiRequestLogs.tokenName, `%${q}%`),
        ilike(publicApiRequestLogs.path, `%${q}%`),
        ilike(publicApiRequestLogs.method, `%${q}%`),
      )!,
    );
  }

  if (args.cursor) {
    const cursorDate = new Date(args.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(publicApiRequestLogs.createdAt, cursorDate));
    }
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = await db
    .select({
      id: publicApiRequestLogs.id,
      createdAt: publicApiRequestLogs.createdAt,
      tokenId: publicApiRequestLogs.tokenId,
      tokenName: publicApiRequestLogs.tokenName,
      tokenSource: publicApiRequestLogs.tokenSource,
      method: publicApiRequestLogs.method,
      path: publicApiRequestLogs.path,
      statusCode: publicApiRequestLogs.statusCode,
      durationMs: publicApiRequestLogs.durationMs,
      ip: publicApiRequestLogs.ip,
      ownerIdentityId: publicApiRequestLogs.ownerIdentityId,
    })
    .from(publicApiRequestLogs)
    .where(where)
    .orderBy(desc(publicApiRequestLogs.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? slice[slice.length - 1]?.createdAt.toISOString() ?? null
    : null;

  return {
    items: slice.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      tokenId: r.tokenId,
      tokenName: r.tokenName,
      tokenSource: r.tokenSource,
      method: r.method,
      path: r.path,
      statusCode: r.statusCode,
      durationMs: r.durationMs,
      ip: r.ip,
      ownerIdentityId: r.ownerIdentityId,
    })),
    nextCursor,
  };
}

export async function listOpsApiTokenFilters() {
  const active = await listActivePublicApiTokens();
  return {
    tokens: active.map(toPublicApiTokenPublic),
  };
}
