import { NextRequest, NextResponse } from "next/server";
import { assertMeetingHost } from "@/lib/hostAuth";
import { resolveRecordingConfig } from "@/lib/app-settings";
import {
  listMeetingRecordings,
  serializeRecording,
  startMeetingRecording,
  stopMeetingRecording,
} from "@/lib/recording";
import { getSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id: meetingId } = await ctx.params;
  const session = await getSession();
  const auth = await assertMeetingHost({ meetingId, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const config = await resolveRecordingConfig();
  const rows = await listMeetingRecordings(meetingId);
  const active = rows.find((r) =>
    ["pending", "recording", "uploading"].includes(r.status),
  );

  return NextResponse.json({
    enabled: config.enabled,
    engine: config.engine,
    controlMode: config.controlMode,
    storage: config.storage,
    active: active ? serializeRecording(active, meetingId) : null,
    recordings: rows.map((r) => serializeRecording(r, meetingId)),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: meetingId } = await ctx.params;
  const session = await getSession();
  const auth = await assertMeetingHost({ meetingId, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let action = "start";
  let allowAuto = false;
  try {
    const body = (await req.json()) as { action?: string; auto?: boolean };
    if (body.action === "stop") action = "stop";
    if (body.auto === true) allowAuto = true;
  } catch {
    // empty body = start
  }
  if (req.nextUrl?.searchParams?.get("auto") === "1") {
    allowAuto = true;
  }

  if (action === "stop") {
    const result = await stopMeetingRecording({ meetingId });
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
      recording: result.recording
        ? serializeRecording(result.recording, meetingId)
        : null,
    });
  }

  const result = await startMeetingRecording({ meetingId, allowAuto });
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
    engine: result.engine,
    recording: serializeRecording(result.recording, meetingId),
  });
}
