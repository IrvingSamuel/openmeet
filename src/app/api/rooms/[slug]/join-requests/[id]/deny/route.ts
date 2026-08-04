import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { joinRequests } from "@/db/schema";
import { getSession } from "@/lib/session";
import { assertRoomHost } from "@/lib/hostAuth";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  const session = await getSession();
  const auth = await assertRoomHost({ slug, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const existing = await db.query.joinRequests.findFirst({
    where: and(eq(joinRequests.id, id), eq(joinRequests.roomId, auth.room.id)),
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({
      ok: true,
      id: existing.id,
      status: existing.status,
    });
  }

  const [updated] = await db
    .update(joinRequests)
    .set({ status: "denied", resolvedAt: new Date() })
    .where(eq(joinRequests.id, id))
    .returning();

  return NextResponse.json({
    ok: true,
    id: updated.id,
    status: updated.status,
  });
}
