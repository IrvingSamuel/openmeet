import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { participants, rooms } from "@/db/schema";
import type { SessionData } from "@/lib/session";

export type HostAuthResult =
  | { ok: true; room: typeof rooms.$inferSelect }
  | { ok: false; status: 401 | 403 | 404; error: string };

/** Room owner, or an active host participant on the given meeting. */
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
    return { ok: true, room };
  }

  if (opts.meetingId) {
    const hostRow = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, opts.meetingId),
        eq(participants.identityId, opts.session.identityId),
        eq(participants.role, "host"),
        isNull(participants.leftAt),
      ),
    });
    if (hostRow) {
      return { ok: true, room };
    }
  }

  return { ok: false, status: 403, error: "forbidden" };
}

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

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, meeting.roomId),
  });
  if (!room) {
    return { ok: false, status: 404, error: "room_not_found" };
  }

  if (opts.session.identityId === room.ownerIdentityId) {
    return { ok: true, room };
  }

  const hostRow = await db.query.participants.findFirst({
    where: and(
      eq(participants.meetingId, opts.meetingId),
      eq(participants.identityId, opts.session.identityId),
      eq(participants.role, "host"),
    ),
  });
  if (hostRow) {
    return { ok: true, room };
  }

  return { ok: false, status: 403, error: "forbidden" };
}
