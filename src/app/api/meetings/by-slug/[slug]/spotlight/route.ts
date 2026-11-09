import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { assertMeetingSlugModerator } from "@/lib/hostAuth";
import { setRoomSpotlight } from "@/lib/livekit";

const schema = z.object({
  key: z.string().min(1).max(260).nullable(),
  by: z.string().min(1).max(200),
});

function isAgentKey(key: string) {
  return key.startsWith("agent-") || key.startsWith("agent_");
}

/** Pin (or unpin) a participant for everyone in the meeting. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const session = await getSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = parsed.data;

  const auth = await assertMeetingSlugModerator({ slug, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (body.key && isAgentKey(body.key)) {
    return NextResponse.json({ error: "cannot_pin_agent" }, { status: 400 });
  }

  try {
    const spotlight = body.key
      ? { key: body.key, by: body.by, at: Date.now() }
      : null;
    await setRoomSpotlight(auth.room.livekitRoomName, spotlight);
    return NextResponse.json({ ok: true, spotlight });
  } catch (err) {
    console.error("[openmeet] spotlight", err);
    return NextResponse.json({ error: "spotlight_failed" }, { status: 502 });
  }
}
