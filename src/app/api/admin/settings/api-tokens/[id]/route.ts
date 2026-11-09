import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { publicApiTokens } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { migrateLegacyPublicApiToken } from "@/lib/public-api-tokens";
import { getSession, sessionUserId } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const ownerId = sessionUserId(session);
  if (!isAdmin(session) || !ownerId) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { session, ownerId };
}

/** DELETE — soft-revoke a public API token. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  await migrateLegacyPublicApiToken();

  const [updated] = await db
    .update(publicApiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(publicApiTokens.id, id), isNull(publicApiTokens.revokedAt)),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ revoked: true, id: updated.id });
}
