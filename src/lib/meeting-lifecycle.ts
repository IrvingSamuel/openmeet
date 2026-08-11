import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";

/** Seconds without a real join (or empty LiveKit room) before auto-end. */
export const MEETING_EMPTY_TIMEOUT_SEC = 60;

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

  const orphanIds: string[] = [];
  for (const candidate of orphanCandidates) {
    const open = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, candidate.id),
        isNull(participants.leftAt),
      ),
      columns: { id: true },
    });
    if (!open) orphanIds.push(candidate.id);
  }

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

/** Expire stale meetings then re-load by slug (for join/metadata routes). */
export async function loadMeetingBySlugAfterExpiry(slug: string) {
  const existing = await db.query.meetings.findFirst({
    where: eq(meetings.slug, slug),
  });
  if (!existing) return null;
  if (existing.status === "scheduled" || existing.status === "active") {
    await expireStaleMeetings({ meetingId: existing.id });
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
