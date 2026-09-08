import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";
import type { SessionData } from "@/lib/session";
import type { MeetingHostContext } from "@/lib/hostAuth";

export type MeetingAccessResult =
  | {
      ok: true;
      meeting: typeof meetings.$inferSelect;
      room: MeetingHostContext;
      isOwner: boolean;
      isParticipant: boolean;
    }
  | { ok: false; status: 401 | 403 | 404; error: string };

function meetingAsContext(
  meeting: typeof meetings.$inferSelect,
): MeetingHostContext {
  return {
    id: meeting.id,
    slug: meeting.slug,
    title: meeting.title,
    ownerIdentityId: meeting.ownerIdentityId,
    boardId: meeting.boardId,
    livekitRoomName: meeting.livekitRoomName,
    accessPolicy: meeting.accessPolicy,
    roomId: meeting.roomId,
  };
}

/**
 * Meeting owner, a logged-in meeting participant, or (for ended meetings)
 * anyone with the meeting id — guests receive the summary URL after end.
 */
export async function assertMeetingSummaryAccess(opts: {
  meetingId: string;
  session: SessionData;
  allowEndedPublic?: boolean;
}): Promise<MeetingAccessResult> {
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, opts.meetingId),
  });
  if (!meeting) {
    return { ok: false, status: 404, error: "not_found" };
  }

  const room = meetingAsContext(meeting);
  const identityId = opts.session.identityId;
  const isOwner = Boolean(identityId) && identityId === meeting.ownerIdentityId;

  let isParticipant = false;
  if (identityId) {
    const row = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, meeting.id),
        eq(participants.identityId, identityId),
      ),
    });
    isParticipant = Boolean(row);
  }

  if (isOwner || isParticipant) {
    return { ok: true, meeting, room, isOwner, isParticipant };
  }

  if (opts.allowEndedPublic && meeting.status === "ended") {
    return {
      ok: true,
      meeting,
      room,
      isOwner: false,
      isParticipant: false,
    };
  }

  if (!opts.session.isLoggedIn) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: false, status: 403, error: "forbidden" };
}
