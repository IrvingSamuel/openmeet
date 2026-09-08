import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants, rooms } from "@/db/schema";
import type { SessionData } from "@/lib/session";

/** Room-shaped context derived from a meeting (join/LiveKit identity). */
export type MeetingHostContext = {
  id: string;
  slug: string;
  title: string;
  ownerIdentityId: string;
  boardId: string | null;
  livekitRoomName: string;
  accessPolicy: string;
  roomId: string | null;
};

export type HostAuthResult =
  | {
      ok: true;
      room: MeetingHostContext;
      meeting: typeof meetings.$inferSelect | null;
    }
  | { ok: false; status: 401 | 403 | 404; error: string };

function meetingAsHostContext(
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

/** Meeting owner, or an active host participant on the given meeting. */
export async function assertMeetingHost(opts: {
  meetingId: string;
  session: SessionData;
}): Promise<HostAuthResult> {
  if (!opts.session.isLoggedIn || !opts.session.identityId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const meeting = await db.query.meetings.findFirst({
    where: (m, { eq: e }) => e(m.id, opts.meetingId),
  });
  if (!meeting) {
    return { ok: false, status: 404, error: "not_found" };
  }

  if (opts.session.identityId === meeting.ownerIdentityId) {
    return { ok: true, room: meetingAsHostContext(meeting), meeting };
  }

  const hostRow = await db.query.participants.findFirst({
    where: and(
      eq(participants.meetingId, opts.meetingId),
      eq(participants.identityId, opts.session.identityId),
      eq(participants.role, "host"),
    ),
  });
  if (hostRow) {
    return { ok: true, room: meetingAsHostContext(meeting), meeting };
  }

  return { ok: false, status: 403, error: "forbidden" };
}

/** Brand-template room host (owner), optionally with an active meeting host role. */
export async function assertRoomHost(opts: {
  slug: string;
  session: SessionData;
  meetingId?: string;
}): Promise<HostAuthResult> {
  if (!opts.session.isLoggedIn || !opts.session.identityId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.slug, opts.slug),
  });
  if (!room) {
    return { ok: false, status: 404, error: "not_found" };
  }

  if (opts.session.identityId === room.ownerIdentityId) {
    const meeting = opts.meetingId
      ? await db.query.meetings.findFirst({
          where: (m, { eq: e }) => e(m.id, opts.meetingId!),
        })
      : null;
    return {
      ok: true,
      room: {
        id: room.id,
        slug: room.slug,
        title: room.title,
        ownerIdentityId: room.ownerIdentityId,
        boardId: room.boardId,
        livekitRoomName: room.livekitRoomName,
        accessPolicy: room.accessPolicy,
        roomId: room.id,
      },
      meeting: meeting as typeof meetings.$inferSelect,
    };
  }

  if (opts.meetingId) {
    return assertMeetingHost({
      meetingId: opts.meetingId,
      session: opts.session,
    });
  }

  return { ok: false, status: 403, error: "forbidden" };
}

export async function assertMeetingSlugHost(opts: {
  slug: string;
  session: SessionData;
}): Promise<HostAuthResult> {
  if (!opts.session.isLoggedIn || !opts.session.identityId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.slug, opts.slug),
  });
  if (!meeting) {
    return { ok: false, status: 404, error: "not_found" };
  }
  return assertMeetingHost({ meetingId: meeting.id, session: opts.session });
}

/** @deprecated use assertMeetingSlugHost — kept for waiting-room room routes during migration */
export async function assertActiveHostOnMeeting(opts: {
  meetingId: string;
  session: SessionData;
}): Promise<boolean> {
  if (!opts.session.isLoggedIn || !opts.session.identityId) return false;
  const hostRow = await db.query.participants.findFirst({
    where: and(
      eq(participants.meetingId, opts.meetingId),
      eq(participants.identityId, opts.session.identityId),
      eq(participants.role, "host"),
      isNull(participants.leftAt),
    ),
  });
  return Boolean(hostRow);
}
