import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { joinRequests } from "@/db/schema";
import { getSession } from "@/lib/session";
import { assertMeetingSlugHost } from "@/lib/hostAuth";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const session = await getSession();
  const auth = await assertMeetingSlugHost({ slug, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pending = await db.query.joinRequests.findMany({
    where: and(
      eq(joinRequests.meetingId, auth.room.id),
      eq(joinRequests.status, "pending"),
    ),
    orderBy: [desc(joinRequests.createdAt)],
  });

  return NextResponse.json({
    requests: pending.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      createdAt: r.createdAt,
    })),
  });
}
