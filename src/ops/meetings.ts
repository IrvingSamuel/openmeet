import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";
import { getRoomServiceClient } from "@/lib/livekit";
import { endMeetingRow } from "@/lib/meeting-lifecycle";
import { stopMeetingRecording } from "@/lib/recording";

async function evictLiveKitRoom(livekitRoomName: string) {
  const client = getRoomServiceClient();
  try {
    await client.deleteRoom(livekitRoomName);
  } catch {
    try {
      const list = await client.listParticipants(livekitRoomName);
      await Promise.allSettled(
        list.map((p) => client.removeParticipant(livekitRoomName, p.identity)),
      );
    } catch {
      // room already gone
    }
  }
}

/** End a meeting owned by tenant (ops). */
export async function opsEndMeeting(ownerId: string, meetingId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: and(
      eq(meetings.id, meetingId),
      eq(meetings.ownerIdentityId, ownerId),
    ),
    columns: {
      id: true,
      livekitRoomName: true,
      status: true,
    },
  });
  if (!meeting) {
    return { ok: false as const, error: "not_found" as const };
  }
  if (meeting.status === "ended") {
    return { ok: true as const, alreadyEnded: true };
  }

  try {
    await stopMeetingRecording({ meetingId, force: true });
  } catch {
    // continue ending even if recording stop fails
  }

  await endMeetingRow(meetingId);
  await db
    .update(participants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(participants.meetingId, meetingId),
        isNull(participants.leftAt),
      ),
    );

  try {
    await evictLiveKitRoom(meeting.livekitRoomName);
  } catch (err) {
    console.warn("[ops] livekit evict failed", err);
  }

  return { ok: true as const, alreadyEnded: false };
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export function parseUuidParam(raw: string | undefined) {
  if (!raw) return null;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(raw) ? raw : null;
}

export function readSearch(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}
