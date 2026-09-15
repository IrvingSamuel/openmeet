import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  identityBrands,
  identityMediaPrefs,
  meetingSummaries,
  meetings,
  oauthAccounts,
  participants,
  recordings,
  rooms,
  transcriptSegments,
  users,
  type UserRole,
} from "@/db/schema";

export async function listTenants(opts?: { q?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const q = opts?.q?.trim();

  const where = q
    ? or(
        ilike(users.email, `%${q}%`),
        ilike(users.name, `%${q}%`),
        ilike(users.externalId, `%${q}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdVia: users.createdVia,
      externalId: users.externalId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [roomCounts, meetingCounts, activeCounts] = await Promise.all([
    db
      .select({
        ownerId: rooms.ownerIdentityId,
        n: count(),
      })
      .from(rooms)
      .where(inArray(rooms.ownerIdentityId, ids))
      .groupBy(rooms.ownerIdentityId),
    db
      .select({
        ownerId: meetings.ownerIdentityId,
        n: count(),
      })
      .from(meetings)
      .where(inArray(meetings.ownerIdentityId, ids))
      .groupBy(meetings.ownerIdentityId),
    db
      .select({
        ownerId: meetings.ownerIdentityId,
        n: count(),
      })
      .from(meetings)
      .where(
        and(
          inArray(meetings.ownerIdentityId, ids),
          eq(meetings.status, "active"),
        ),
      )
      .groupBy(meetings.ownerIdentityId),
  ]);

  const roomMap = new Map(roomCounts.map((r) => [r.ownerId, Number(r.n)]));
  const meetMap = new Map(meetingCounts.map((r) => [r.ownerId, Number(r.n)]));
  const activeMap = new Map(activeCounts.map((r) => [r.ownerId, Number(r.n)]));

  return rows.map((r) => ({
    ...r,
    roomCount: roomMap.get(r.id) ?? 0,
    meetingCount: meetMap.get(r.id) ?? 0,
    activeMeetingCount: activeMap.get(r.id) ?? 0,
  }));
}

export async function getTenant(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  if (!user) return null;

  const [brand, mediaPrefs, oauth, roomCountRow, meetingCountRow, activeCountRow] =
    await Promise.all([
      db.query.identityBrands.findFirst({
        where: eq(identityBrands.identityId, id),
      }),
      db.query.identityMediaPrefs.findFirst({
        where: eq(identityMediaPrefs.identityId, id),
      }),
      db
        .select({
          id: oauthAccounts.id,
          provider: oauthAccounts.provider,
          subject: oauthAccounts.subject,
          createdAt: oauthAccounts.createdAt,
        })
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, id)),
      db
        .select({ value: count() })
        .from(rooms)
        .where(eq(rooms.ownerIdentityId, id)),
      db
        .select({ value: count() })
        .from(meetings)
        .where(eq(meetings.ownerIdentityId, id)),
      db
        .select({ value: count() })
        .from(meetings)
        .where(
          and(eq(meetings.ownerIdentityId, id), eq(meetings.status, "active")),
        ),
    ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdVia: user.createdVia,
      externalId: user.externalId,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    counts: {
      rooms: Number(roomCountRow[0]?.value ?? 0),
      meetings: Number(meetingCountRow[0]?.value ?? 0),
      activeMeetings: Number(activeCountRow[0]?.value ?? 0),
    },
    brand: brand
      ? {
          wordmark: brand.wordmark,
          logoUrl: brand.logoUrl,
          primaryColor: brand.primaryColor,
          background: brand.background,
          themePreset: brand.themePreset,
        }
      : null,
    mediaPrefs: mediaPrefs
      ? {
          videoEffect: mediaPrefs.videoEffect,
          blurRadius: mediaPrefs.blurRadius,
          virtualBackgroundUrl: mediaPrefs.virtualBackgroundUrl,
          noiseSuppression: mediaPrefs.noiseSuppression,
          echoCancellation: mediaPrefs.echoCancellation,
          autoGainControl: mediaPrefs.autoGainControl,
        }
      : null,
    oauth,
  };
}

export async function listTenantRooms(ownerId: string) {
  return db
    .select({
      id: rooms.id,
      slug: rooms.slug,
      title: rooms.title,
      kind: rooms.kind,
      accessPolicy: rooms.accessPolicy,
      boardId: rooms.boardId,
      createdAt: rooms.createdAt,
    })
    .from(rooms)
    .where(eq(rooms.ownerIdentityId, ownerId))
    .orderBy(desc(rooms.createdAt));
}

export async function listTenantMeetings(ownerId: string, limit = 100) {
  const rows = await db
    .select({
      id: meetings.id,
      slug: meetings.slug,
      title: meetings.title,
      status: meetings.status,
      summaryStatus: meetings.summaryStatus,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      livekitRoomName: meetings.livekitRoomName,
      summaryId: meetingSummaries.id,
    })
    .from(meetings)
    .leftJoin(meetingSummaries, eq(meetingSummaries.meetingId, meetings.id))
    .where(eq(meetings.ownerIdentityId, ownerId))
    .orderBy(desc(meetings.startedAt))
    .limit(Math.min(Math.max(limit, 1), 500));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    summaryStatus: r.summaryStatus,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    livekitRoomName: r.livekitRoomName,
    hasSummary: Boolean(r.summaryId),
  }));
}

export async function getTenantMeeting(ownerId: string, meetingId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: and(
      eq(meetings.id, meetingId),
      eq(meetings.ownerIdentityId, ownerId),
    ),
  });
  if (!meeting) return null;

  const [summary, partRows, recordingRows, transcriptCountRow] =
    await Promise.all([
      db.query.meetingSummaries.findFirst({
        where: eq(meetingSummaries.meetingId, meetingId),
      }),
      db
        .select({
          id: participants.id,
          displayName: participants.displayName,
          role: participants.role,
          livekitIdentity: participants.livekitIdentity,
          joinedAt: participants.joinedAt,
          leftAt: participants.leftAt,
          connectedAt: participants.connectedAt,
        })
        .from(participants)
        .where(eq(participants.meetingId, meetingId))
        .orderBy(participants.joinedAt),
      db
        .select({
          id: recordings.id,
          status: recordings.status,
          engine: recordings.engine,
          storageBackend: recordings.storageBackend,
          bytes: recordings.bytes,
          mimeType: recordings.mimeType,
          error: recordings.error,
          startedAt: recordings.startedAt,
          endedAt: recordings.endedAt,
          createdAt: recordings.createdAt,
        })
        .from(recordings)
        .where(eq(recordings.meetingId, meetingId))
        .orderBy(desc(recordings.createdAt)),
      db
        .select({ value: count() })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, meetingId)),
    ]);

  return {
    meeting: {
      id: meeting.id,
      slug: meeting.slug,
      title: meeting.title,
      status: meeting.status,
      summaryStatus: meeting.summaryStatus,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      livekitRoomName: meeting.livekitRoomName,
      accessPolicy: meeting.accessPolicy,
      boardId: meeting.boardId,
    },
    summary: summary
      ? {
          id: summary.id,
          markdown: summary.summaryMarkdown,
          model: summary.model,
          createdAt: summary.createdAt,
        }
      : null,
    participants: partRows,
    recordings: recordingRows,
    transcriptCount: Number(transcriptCountRow[0]?.value ?? 0),
  };
}

export async function setTenantRole(id: string, role: UserRole) {
  const [row] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    });
  return row ?? null;
}
