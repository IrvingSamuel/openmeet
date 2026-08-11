import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, meetingBrands } from "@/db/schema";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.slug, slug),
  });
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
