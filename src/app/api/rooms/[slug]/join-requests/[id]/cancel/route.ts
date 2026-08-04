import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { joinRequests, rooms } from "@/db/schema";

function sanitizeInstance(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

/** Guest cancels their own pending join request. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    clientInstanceId?: string;
  };
  const instance = sanitizeInstance(body.clientInstanceId);
  if (!instance) {
    return NextResponse.json({ error: "client_instance_required" }, { status: 400 });
  }

  const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
  if (!room) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const existing = await db.query.joinRequests.findFirst({
    where: and(eq(joinRequests.id, id), eq(joinRequests.roomId, room.id)),
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.clientInstanceId !== instance) {
    return NextResponse.json({ error: "request_mismatch" }, { status: 403 });
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
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(eq(joinRequests.id, id))
    .returning();

  return NextResponse.json({
    ok: true,
    id: updated.id,
    status: updated.status,
  });
}
