import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createReadStream, existsSync } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { db } from "@/db";
import { meetings, recordings } from "@/db/schema";
import { getSession, type SessionData } from "@/lib/session";
import { getRecordingSignedUrl } from "@/lib/recording-storage";

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
  if (meeting.ownerIdentityId === session.identityId) return true;

  const { assertMeetingHost } = await import("@/lib/hostAuth");
  const auth = await assertMeetingHost({ meetingId, session });
  return auth.ok;
}

function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header || !header.startsWith("bytes=")) return null;
  const part = header.slice(6).split(",")[0]?.trim();
  if (!part) return null;
  const [startStr, endStr] = part.split("-");
  let start = startStr === "" ? NaN : Number(startStr);
  let end = endStr === "" || endStr === undefined ? NaN : Number(endStr);
  if (Number.isNaN(start)) {
    // suffix: bytes=-500
    if (Number.isNaN(end)) return null;
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end >= size || start > end) return null;
  return { start, end };
}

export async function GET(req: NextRequest, ctx: Ctx) {
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

  const asDownload = req.nextUrl.searchParams.get("download") === "1";
  const filename = `meeting-${meetingId.slice(0, 8)}-${recordingId.slice(0, 8)}.${
    row.mimeType?.includes("mp4") ? "mp4" : "webm"
  }`;
  const disposition = asDownload
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  if (row.storageBackend === "s3" && row.objectKey) {
    const url = await getRecordingSignedUrl({ objectKey: row.objectKey });
    return NextResponse.redirect(url, 302);
  }

  if (!row.filepath || !existsSync(row.filepath)) {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }

  try {
    const info = await stat(row.filepath);
    const size = info.size;
    const contentType = row.mimeType || "video/webm";
    const range = parseRange(req.headers.get("range"), size);

    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const stream = createReadStream(row.filepath, { start, end });
      const webStream = Readable.toWeb(stream) as ReadableStream;
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const stream = createReadStream(row.filepath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }
}
