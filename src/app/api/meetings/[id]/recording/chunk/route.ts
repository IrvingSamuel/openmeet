import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { assertMeetingHost } from "@/lib/hostAuth";
import { appendBrowserChunk } from "@/lib/recording";
import { getSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** Host uploads a MediaRecorder chunk (binary body). Query: ?recordingId= */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: meetingId } = await ctx.params;
  const session = await getSession();
  const auth = await assertMeetingHost({ meetingId, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const recordingId = req.nextUrl.searchParams.get("recordingId");
  if (!recordingId) {
    return NextResponse.json({ error: "recording_id_required" }, { status: 400 });
  }

  const row = await db.query.recordings.findFirst({
    where: and(
      eq(recordings.id, recordingId),
      eq(recordings.meetingId, meetingId),
    ),
  });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "empty_chunk" }, { status: 400 });
  }
  if (buf.byteLength > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "chunk_too_large" }, { status: 413 });
  }

  const result = await appendBrowserChunk({
    meetingId,
    recordingId,
    chunk: buf,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
