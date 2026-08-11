import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { assertMeetingSlugHost } from "@/lib/hostAuth";
import { moderateParticipant } from "@/lib/livekit";

const schema = z.object({
  action: z.enum(["mute", "camera_off", "remove"]),
  identity: z.string().min(1).max(200),
  meetingId: z.string().uuid().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const session = await getSession();
  const body = schema.parse(await req.json());

  const auth = await assertMeetingSlugHost({ slug, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await moderateParticipant({
      livekitRoomName: auth.room.livekitRoomName,
      identity: body.identity,
      action: body.action,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "moderate_failed";
    if (message === "cannot_moderate_agent") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[chronos-meet] moderate", err);
    return NextResponse.json({ error: "moderate_failed" }, { status: 502 });
  }
}
