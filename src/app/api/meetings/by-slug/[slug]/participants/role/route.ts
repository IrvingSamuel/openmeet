import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { assertMeetingSlugHost } from "@/lib/hostAuth";
import { updateParticipantRole } from "@/lib/livekit";
import { getSession } from "@/lib/session";

const schema = z.object({
  identity: z.string().min(1).max(200),
  role: z.enum(["moderator", "participant"]),
});

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

  const auth = await assertMeetingSlugHost({ slug, session });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const target = await db.query.participants.findFirst({
    where: and(
      eq(participants.meetingId, auth.room.id),
      eq(participants.livekitIdentity, parsed.data.identity),
      isNull(participants.leftAt),
    ),
  });
  if (!target) {
    return NextResponse.json({ error: "participant_not_found" }, { status: 404 });
  }
  if (
    target.identityId === auth.room.ownerIdentityId ||
    target.role === "host" ||
    target.livekitIdentity.startsWith("agent-") ||
    target.livekitIdentity.startsWith("agent_")
  ) {
    return NextResponse.json(
      { error: "participant_role_protected" },
      { status: 400 },
    );
  }

  const previousRole = target.role;
  const [updated] = await db
    .update(participants)
    .set({ role: parsed.data.role })
    .where(
      and(
        eq(participants.id, target.id),
        eq(participants.meetingId, auth.room.id),
        isNull(participants.leftAt),
      ),
    )
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "participant_not_found" }, { status: 404 });
  }

  try {
    await updateParticipantRole({
      livekitRoomName: auth.room.livekitRoomName,
      identity: target.livekitIdentity,
      role: parsed.data.role,
    });
  } catch (err) {
    await db
      .update(participants)
      .set({ role: previousRole })
      .where(eq(participants.id, target.id));
    console.error("[openmeet] participant role update failed", err);
    return NextResponse.json({ error: "role_update_failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    identity: target.livekitIdentity,
    role: parsed.data.role,
  });
}
