import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";
import { getRoomServiceClient } from "@/lib/livekit";

/** Seconds without a real join (or empty LiveKit room) before auto-end. */
export const MEETING_EMPTY_TIMEOUT_SEC = 60;

export type MeetingReconcileResult = {
  expiredScheduled: string[];
  expiredOrphans: string[];
  expiredAbandoned: string[];
  livekitUnavailable?: boolean;
};

/**
 * Mark a scheduled meeting as active when the first participant actually joins
 * (token issued / LiveKit room started). Overwrites startedAt to the real start.
 */
export async function activateMeetingIfScheduled(meetingId: string) {
  const now = new Date();
  const updated = await db
    .update(meetings)
    .set({ status: "active", startedAt: now })
    .where(and(eq(meetings.id, meetingId), eq(meetings.status, "scheduled")))
    .returning({ id: meetings.id });
  return updated.length > 0;
}

async function meetingIdsWithOpenParticipants(meetingIds: string[]) {
  if (meetingIds.length === 0) return new Set<string>();
  const rows = await db
    .selectDistinct({ meetingId: participants.meetingId })
    .from(participants)
    .where(
      and(
        inArray(participants.meetingId, meetingIds),
        isNull(participants.leftAt),
      ),
    );
  return new Set(rows.map((r) => r.meetingId));
}

/**
 * End scheduled meetings that never got a join, and orphan active meetings
 * that never reached LiveKit (no room SID, no open participants).
 * Does not trigger summary generation.
 */
export async function expireStaleMeetings(opts?: { meetingId?: string }) {
  const cutoff = new Date(Date.now() - MEETING_EMPTY_TIMEOUT_SEC * 1000);
  const endedAt = new Date();

  const scheduledWhere = opts?.meetingId
    ? and(
        eq(meetings.id, opts.meetingId),
        eq(meetings.status, "scheduled"),
        lt(meetings.startedAt, cutoff),
      )
    : and(eq(meetings.status, "scheduled"), lt(meetings.startedAt, cutoff));

  const scheduled = await db
    .update(meetings)
    .set({ status: "ended", endedAt })
    .where(scheduledWhere)
    .returning({ id: meetings.id });

  const orphanCandidates = await db.query.meetings.findMany({
    where: opts?.meetingId
      ? and(
          eq(meetings.id, opts.meetingId),
          eq(meetings.status, "active"),
          isNull(meetings.livekitRoomSid),
          lt(meetings.startedAt, cutoff),
        )
      : and(
          eq(meetings.status, "active"),
          isNull(meetings.livekitRoomSid),
          lt(meetings.startedAt, cutoff),
        ),
    columns: { id: true },
  });

  const openParticipants = await meetingIdsWithOpenParticipants(
    orphanCandidates.map((c) => c.id),
  );
  const orphanIds = orphanCandidates
    .filter((c) => !openParticipants.has(c.id))
    .map((c) => c.id);

  let orphans: { id: string }[] = [];
  if (orphanIds.length > 0) {
    orphans = await db
      .update(meetings)
      .set({ status: "ended", endedAt })
      .where(
        and(inArray(meetings.id, orphanIds), eq(meetings.status, "active")),
      )
      .returning({ id: meetings.id });
  }

  return {
    expiredScheduled: scheduled.map((r) => r.id),
    expiredOrphans: orphans.map((r) => r.id),
  };
}

/**
 * End active meetings whose LiveKit room is missing or empty (webhook missed).
 * Does not trigger summary generation.
 */
export async function reconcileActiveMeetingsWithLiveKit(opts?: {
  meetingId?: string;
}) {
  const cutoff = new Date(Date.now() - MEETING_EMPTY_TIMEOUT_SEC * 1000);
  const endedAt = new Date();

  const activeWhere = opts?.meetingId
    ? and(
        eq(meetings.id, opts.meetingId),
        eq(meetings.status, "active"),
        lt(meetings.startedAt, cutoff),
      )
    : and(eq(meetings.status, "active"), lt(meetings.startedAt, cutoff));

  const activeRows = await db.query.meetings.findMany({
    where: activeWhere,
    columns: { id: true, livekitRoomName: true },
  });

  if (activeRows.length === 0) {
    return { expiredAbandoned: [] as string[] };
  }

  const openParticipants = await meetingIdsWithOpenParticipants(
    activeRows.map((r) => r.id),
  );
  const candidates = activeRows.filter((r) => !openParticipants.has(r.id));
  if (candidates.length === 0) {
    return { expiredAbandoned: [] as string[] };
  }

  let livekitOccupancy = new Map<string, number>();
  try {
    const rooms = await getRoomServiceClient().listRooms();
    livekitOccupancy = new Map(
      rooms.map((room) => [room.name, room.numParticipants]),
    );
  } catch (err) {
    console.warn("[openmeet] LiveKit listRooms failed during reconcile", err);
    return { expiredAbandoned: [] as string[], livekitUnavailable: true };
  }

  const toEnd: string[] = [];
  const roomsToDelete: string[] = [];

  for (const row of candidates) {
    const occupancy = livekitOccupancy.get(row.livekitRoomName);
    if (occupancy === undefined || occupancy === 0) {
      toEnd.push(row.id);
      if (occupancy === 0) {
        roomsToDelete.push(row.livekitRoomName);
      }
    }
  }

  if (roomsToDelete.length > 0) {
    const client = getRoomServiceClient();
    await Promise.allSettled(
      roomsToDelete.map((roomName) => client.deleteRoom(roomName)),
    );
  }

  if (toEnd.length === 0) {
    return { expiredAbandoned: [] as string[] };
  }

  const ended = await db
    .update(meetings)
    .set({ status: "ended", endedAt })
    .where(and(inArray(meetings.id, toEnd), eq(meetings.status, "active")))
    .returning({ id: meetings.id });

  return { expiredAbandoned: ended.map((r) => r.id) };
}

/** DB + LiveKit reconciliation — safe to run on a schedule. */
export async function reconcileAndExpireMeetings(opts?: {
  meetingId?: string;
}): Promise<MeetingReconcileResult> {
  const stale = await expireStaleMeetings(opts);
  const abandoned = await reconcileActiveMeetingsWithLiveKit(opts);
  return { ...stale, ...abandoned };
}

let reconcileInFlight: Promise<MeetingReconcileResult> | null = null;

/** Coalesced background reconcile for request handlers (non-blocking). */
export function scheduleMeetingReconcile(opts?: { meetingId?: string }) {
  if (reconcileInFlight) return;
  reconcileInFlight = reconcileAndExpireMeetings(opts)
    .catch((err) => {
      console.error("[openmeet] background meeting reconcile failed", err);
      return {
        expiredScheduled: [],
        expiredOrphans: [],
        expiredAbandoned: [],
      };
    })
    .finally(() => {
      reconcileInFlight = null;
    });
}

/** Expire stale meetings then re-load by slug (for join/metadata routes). */
export async function loadMeetingBySlugAfterExpiry(slug: string) {
  const existing = await db.query.meetings.findFirst({
    where: eq(meetings.slug, slug),
  });
  if (!existing) return null;
  if (existing.status === "scheduled" || existing.status === "active") {
    await reconcileAndExpireMeetings({ meetingId: existing.id });
    return (
      (await db.query.meetings.findFirst({
        where: eq(meetings.slug, slug),
      })) ?? existing
    );
  }
  return existing;
}

export function isJoinableMeetingStatus(status: string) {
  return status === "scheduled" || status === "active";
}

export function endableMeetingStatuses() {
  return ["scheduled", "active"] as const;
}

export async function endMeetingRow(meetingId: string) {
  return db
    .update(meetings)
    .set({ status: "ended", endedAt: new Date() })
    .where(
      and(
        eq(meetings.id, meetingId),
        inArray(meetings.status, [...endableMeetingStatuses()]),
      ),
    );
}
