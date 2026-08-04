import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getRoomServiceClient } from "@/lib/livekit";
import { assertMeetingHost } from "@/lib/hostAuth";

const schema = z.object({
  meetingId: z.string().uuid(),
});

/** Delete the LiveKit room (kicks everyone). Fall back to removing each participant. */
async function evictEveryone(livekitRoomName: string) {
  const client = getRoomServiceClient();
  try {
    await client.deleteRoom(livekitRoomName);
    return;
  } catch (err) {
    console.warn("[chronos-meet] deleteRoom failed, trying removeParticipant", err);
  }

  try {
    const list = await client.listParticipants(livekitRoomName);
    await Promise.allSettled(
      list.map((p) => client.removeParticipant(livekitRoomName, p.identity)),
    );
  } catch (err) {
    // Room may already be gone — treat as success for eviction purposes.
    console.warn("[chronos-meet] list/remove participants after deleteRoom", err);
  }
}

/** Host ends the LiveKit room + marks meeting ended for everyone. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const body = schema.parse(await req.json());

  const auth = await assertMeetingHost({
    meetingId: body.meetingId,
    session,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { room } = auth;

  // Mark ended before kicking so guests can open the summary URL immediately.
  await db
    .update(meetings)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(meetings.id, body.meetingId), eq(meetings.status, "active")));

  await db
    .update(participants)
    .set({ leftAt: new Date() })
    .where(
      and(eq(participants.meetingId, body.meetingId), isNull(participants.leftAt)),
    );

  try {
    await evictEveryone(room.livekitRoomName);
  } catch (err) {
    console.error("[chronos-meet] failed to evict LiveKit room", err);
    return NextResponse.json({ error: "evict_failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    endedByOwner: true,
  });
}
