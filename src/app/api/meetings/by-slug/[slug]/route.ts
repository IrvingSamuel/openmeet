import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetingBrands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadMeetingBySlugAfterExpiry } from "@/lib/meeting-lifecycle";
import { featuresFromRow } from "@/lib/meeting-features";

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
  const features = featuresFromRow(meeting);
  return NextResponse.json({
    meeting: {
      id: meeting.id,
      slug: meeting.slug,
      title: meeting.title,
      accessPolicy: meeting.accessPolicy,
      status: meeting.status,
      boardId: meeting.boardId,
      roomId: meeting.roomId,
      redirectAfterMeet: meeting.redirectAfterMeet ?? null,
      externalInviteUrl: meeting.externalInviteUrl ?? null,
      waitForHost: meeting.waitForHost,
      muteMicOnJoin: meeting.muteMicOnJoin !== false,
      captionsEnabled: features.captions,
      transcriptionEnabled: features.transcription,
      summaryEnabled: features.summary,
    },
    brand,
  });
}
