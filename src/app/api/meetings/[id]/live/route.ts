import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { resolveLiveStreamConfig } from "@/lib/app-settings";
import { assertMeetingModerator } from "@/lib/hostAuth";
import {
  latestLiveStream,
  meetingLiveStreamAllowed,
  refreshLiveStreamStatus,
  serializeLiveStream,
  startMeetingLiveStream,
  stopMeetingLiveStream,
} from "@/lib/live-stream";
import { getSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const RECENT_FAILURE_MS = 2 * 60_000;

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    streamKey: z.string().min(1).max(200),
    rtmpUrl: z.string().max(300).nullable().optional(),
  }),
  z.object({ action: z.literal("stop") }),
]);

/** Status only — visible to every participant (drives the LIVE badge). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id: meetingId } = await ctx.params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
    columns: { id: true, captionsEnabled: true, liveStreamEnabled: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const config = await resolveLiveStreamConfig();
  const active = await refreshLiveStreamStatus(meetingId);
  let lastError: string | null = null;
  if (!active) {
    const latest = await latestLiveStream(meetingId);
    if (
      latest?.status === "failed" &&
      latest.endedAt &&
      Date.now() - latest.endedAt.getTime() < RECENT_FAILURE_MS
    ) {
      lastError = latest.error;
    }
  }

  return NextResponse.json({
    // The button only shows with the instance switch on AND the meeting allowed.
    enabled: config.enabled && meetingLiveStreamAllowed(meeting),
    captionsEnabled: meeting.captionsEnabled !== false,
    active: serializeLiveStream(active),
    lastError,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: meetingId } = await ctx.params;
  const session = await getSession();
  const auth = await assertMeetingModerator({ meetingId, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result =
    body.action === "stop"
      ? await stopMeetingLiveStream({ meetingId })
      : await startMeetingLiveStream({
          meetingId,
          streamKey: body.streamKey,
          rtmpUrl: body.rtmpUrl,
          startedBy: session.identityId ?? (auth.viaHostEntry ? "host_entry" : null),
        });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.detail ? { detail: result.detail } : {}),
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    captionsEnabled: auth.meeting?.captionsEnabled !== false,
    active:
      result.stream && ["starting", "live", "ending"].includes(result.stream.status)
        ? serializeLiveStream(result.stream)
        : null,
  });
}
