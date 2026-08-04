import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { joinRequests, rooms } from "@/db/schema";

function sanitizeInstance(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

/** Guest polls their join-request status. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  const instance = sanitizeInstance(
    req.nextUrl.searchParams.get("clientInstanceId"),
  );
  if (!instance) {
    return NextResponse.json({ error: "client_instance_required" }, { status: 400 });
  }

  const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
  if (!room) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const request = await db.query.joinRequests.findFirst({
    where: and(eq(joinRequests.id, id), eq(joinRequests.roomId, room.id)),
  });
  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (request.clientInstanceId !== instance) {
    return NextResponse.json({ error: "request_mismatch" }, { status: 403 });
  }

  return NextResponse.json({
    id: request.id,
    status: request.status,
    displayName: request.displayName,
  });
}
