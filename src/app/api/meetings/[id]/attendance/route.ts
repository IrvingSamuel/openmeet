import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { participants } from "@/db/schema";
import {
  attendanceToCsv,
  buildAttendanceList,
} from "@/lib/attendance";
import { assertMeetingSummaryAccess } from "@/lib/meetingAccess";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { id: meetingId } = await context.params;
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }

  const session = await getSession();
  const access = await assertMeetingSummaryAccess({
    meetingId,
    session,
    allowEndedPublic: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.query.participants.findMany({
    where: eq(participants.meetingId, meetingId),
    orderBy: [asc(participants.joinedAt)],
  });

  const payload = buildAttendanceList(rows, {
    startedAt: access.meeting.startedAt,
    endedAt: access.meeting.endedAt,
  });

  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const csv = attendanceToCsv(payload);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-${access.meeting.slug}.csv"`,
      },
    });
  }

  return NextResponse.json(payload);
}
