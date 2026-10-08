import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { participants, transcriptSegments } from "@/db/schema";
import { groupKey, isAgentIdentity } from "@/lib/attendance";

/** A lone participant needs this long (with a transcript) to count as a meeting. */
export const SOLO_MEETING_MIN_SEC = 300;
/** Two different people must overlap this long to count as a conversation. */
export const MEETING_MIN_OVERLAP_SEC = 60;

export type PresenceRow = {
  identityId: string | null;
  displayName: string;
  role: string;
  livekitIdentity: string;
  connectedAt: Date | null;
  leftAt: Date | null;
};

export type MeetingPresence = {
  /** Connected human sessions; 0 means presence was not tracked. */
  sessions: number;
  /** A host participant connected at some point. */
  hostJoined: boolean;
  /** Two different people were in the room together for a while. */
  together: boolean;
  /** First connect to last leave (or `now`), in seconds. */
  durationSec: number;
};

export function analyzePresence(
  rows: PresenceRow[],
  now: Date = new Date(),
): MeetingPresence {
  const sessions = rows
    .filter((r) => r.connectedAt && !isAgentIdentity(r.livekitIdentity))
    .map((r) => ({
      key: groupKey(r),
      role: r.role,
      start: r.connectedAt!.getTime(),
      end: (r.leftAt ?? now).getTime(),
    }));

  if (sessions.length === 0) {
    return { sessions: 0, hostJoined: false, together: false, durationSec: 0 };
  }

  let together = false;
  for (let i = 0; i < sessions.length && !together; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]!;
      const b = sessions[j]!;
      if (a.key === b.key) continue;
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlap >= MEETING_MIN_OVERLAP_SEC * 1000) {
        together = true;
        break;
      }
    }
  }

  const first = Math.min(...sessions.map((s) => s.start));
  const last = Math.max(...sessions.map((s) => s.end));
  return {
    sessions: sessions.length,
    hostJoined: sessions.some((s) => s.role === "host"),
    together,
    durationSec: Math.max(0, Math.round((last - first) / 1000)),
  };
}

/** One person, under SOLO_MEETING_MIN_SEC: not worth an LLM summary. */
export function isShortSoloMeeting(presence: MeetingPresence): boolean {
  if (presence.sessions === 0) return false;
  return !presence.together && presence.durationSec < SOLO_MEETING_MIN_SEC;
}

/**
 * Did a meeting actually happen? A host joined, two people talked, or one
 * person stayed SOLO_MEETING_MIN_SEC and something was transcribed. A guest
 * who waited a bit and left does not end the meeting.
 */
export function meetingWasHeld(
  presence: MeetingPresence,
  hasTranscript: boolean,
): boolean {
  if (presence.hostJoined || presence.together) return true;
  // No connect events recorded: trust the transcript.
  if (presence.sessions === 0) return hasTranscript;
  return presence.durationSec >= SOLO_MEETING_MIN_SEC && hasTranscript;
}

export async function loadMeetingPresence(
  meetingId: string,
  now: Date = new Date(),
): Promise<MeetingPresence> {
  const rows = await db.query.participants.findMany({
    where: and(
      eq(participants.meetingId, meetingId),
      isNotNull(participants.connectedAt),
    ),
    columns: {
      identityId: true,
      displayName: true,
      role: true,
      livekitIdentity: true,
      connectedAt: true,
      leftAt: true,
    },
  });
  return analyzePresence(rows, now);
}

export async function meetingHasTranscript(meetingId: string): Promise<boolean> {
  const row = await db.query.transcriptSegments.findFirst({
    where: eq(transcriptSegments.meetingId, meetingId),
    columns: { id: true },
  });
  return Boolean(row);
}
