import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, recordings, rooms } from "@/db/schema";
import { getSession, type SessionData } from "@/lib/session";
import {
  getRecordingSignedUrl,
  openLocalRecordingStream,
} from "@/lib/recording-storage";
import { Readable } from "stream";

type Ctx = { params: Promise<{ id: string; recordingId: string }> };

async function canAccessRecording(
  meetingId: string,
  session: SessionData,
): Promise<boolean> {
  if (!session.isLoggedIn || !session.identityId) return false;

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) return false;

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, meeting.roomId),
  });
  if (!room) return false;
  if (room.ownerIdentityId === session.identityId) return true;

  const { assertMeetingHost } = await import("@/lib/hostAuth");
  const auth = await assertMeetingHost({ meetingId, session });
  return auth.ok;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id: meetingId, recordingId } = await ctx.params;
  const session = await getSession();
  if (!(await canAccessRecording(meetingId, session))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const row = await db.query.recordings.findFirst({
    where: and(
      eq(recordings.id, recordingId),
      eq(recordings.meetingId, meetingId),
    ),
  });
  if (!row || row.status !== "ready") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filename = `meeting-${meetingId.slice(0, 8)}-${recordingId.slice(0, 8)}.${
    row.mimeType?.includes("mp4") ? "mp4" : "webm"
  }`;

  if (row.storageBackend === "s3" && row.objectKey) {
    const url = await getRecordingSignedUrl({ objectKey: row.objectKey });
    return NextResponse.redirect(url, 302);
  }

  if (!row.filepath) {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }

  try {
    const { stream, size } = await openLocalRecordingStream(row.filepath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": row.mimeType || "video/webm",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }
}
