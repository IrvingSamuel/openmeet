import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetingBrands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadMeetingBySlugAfterExpiry } from "@/lib/meeting-lifecycle";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const meeting = await loadMeetingBySlugAfterExpiry(slug);
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const brand = await db.query.meetingBrands.findFirst({
    where: eq(meetingBrands.meetingId, meeting.id),
  });
  return NextResponse.json({
    meeting: {
      id: meeting.id,
      slug: meeting.slug,
      title: meeting.title,
      accessPolicy: meeting.accessPolicy,
      status: meeting.status,
      boardId: meeting.boardId,
      roomId: meeting.roomId,
    },
    brand,
  });
}
