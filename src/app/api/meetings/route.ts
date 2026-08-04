import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  actionItems,
  meetingSummaries,
  meetings,
  participants,
  rooms,
} from "@/db/schema";
import { getSession } from "@/lib/session";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

/** First usable preview line from summary markdown (skip headings / empty). */
function summaryPreview(markdown: string | null | undefined, max = 160): string | null {
  if (!markdown?.trim()) return null;
  for (const raw of markdown.split("\n")) {
    const line = raw
      .replace(/^#+\s*/, "")
      .replace(/^>\s*/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/`+/g, "")
      .trim();
    if (!line) continue;
    if (/^_{1,2}.+_{1,2}$/.test(line)) continue;
    if (line.toLowerCase().startsWith("o resumo automático não pôde")) continue;
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const identityId = session.identityId;
  const slug = req.nextUrl.searchParams.get("slug")?.trim() || null;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || DEFAULT_LIMIT);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_LIMIT),
  );

  // Rooms the user owns (optional slug filter).
  const ownedRooms = await db
    .select({
      id: rooms.id,
      slug: rooms.slug,
      title: rooms.title,
    })
    .from(rooms)
    .where(
      slug
        ? and(eq(rooms.ownerIdentityId, identityId), eq(rooms.slug, slug))
        : eq(rooms.ownerIdentityId, identityId),
    );

  const ownedRoomIds = ownedRooms.map((r) => r.id);
  const ownedRoomIdSet = new Set(ownedRoomIds);

  // Meetings where the user appeared as a Chronos-linked participant.
  const participated = await db
    .selectDistinct({ meetingId: participants.meetingId })
    .from(participants)
    .where(eq(participants.identityId, identityId));

  const participatedMeetingIds = participated.map((p) => p.meetingId);

  if (slug && ownedRooms.length === 0 && participatedMeetingIds.length === 0) {
    // Slug filter with no ownership — still allow if they participated in that room.
    const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
    if (!room) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (ownedRoomIds.length === 0 && participatedMeetingIds.length === 0) {
    return NextResponse.json({ meetings: [] });
  }

  const filters = [];
  if (ownedRoomIds.length > 0) {
    filters.push(inArray(meetings.roomId, ownedRoomIds));
  }
  if (participatedMeetingIds.length > 0) {
    filters.push(inArray(meetings.id, participatedMeetingIds));
  }

  let whereClause = filters.length === 1 ? filters[0]! : or(...filters);

  if (slug) {
    const slugRoom = await db.query.rooms.findFirst({
      where: eq(rooms.slug, slug),
    });
    if (!slugRoom) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    whereClause = and(whereClause, eq(meetings.roomId, slugRoom.id));
  }

  const rows = await db
    .select({
      id: meetings.id,
      roomId: meetings.roomId,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      status: meetings.status,
      summaryStatus: meetings.summaryStatus,
      summaryMarkdown: meetingSummaries.summaryMarkdown,
      summaryModel: meetingSummaries.model,
      summaryCreatedAt: meetingSummaries.createdAt,
      actionItemCount: sql<number>`(
        select count(*)::int from ${actionItems}
        where ${actionItems.meetingId} = ${meetings.id}
      )`,
      roomSlug: rooms.slug,
      roomTitle: rooms.title,
      roomOwnerId: rooms.ownerIdentityId,
    })
    .from(meetings)
    .innerJoin(rooms, eq(rooms.id, meetings.roomId))
    .leftJoin(
      meetingSummaries,
      eq(meetingSummaries.meetingId, meetings.id),
    )
    .where(whereClause)
    .orderBy(desc(meetings.startedAt))
    .limit(limit);

  const list = rows.map((row) => {
    const started = row.startedAt ? new Date(row.startedAt) : null;
    const ended = row.endedAt ? new Date(row.endedAt) : null;
    const durationMs =
      started && ended ? Math.max(0, ended.getTime() - started.getTime()) : null;
    const isOwner = ownedRoomIdSet.has(row.roomId) || row.roomOwnerId === identityId;

    return {
      id: row.id,
      status: row.status,
      summaryStatus: row.summaryStatus,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationMs,
      actionItemCount: Number(row.actionItemCount) || 0,
      hasSummary: Boolean(row.summaryMarkdown),
      summaryPreview: summaryPreview(row.summaryMarkdown),
      summaryModel: row.summaryModel,
      summaryCreatedAt: row.summaryCreatedAt,
      relation: isOwner ? ("owner" as const) : ("participant" as const),
      room: {
        id: row.roomId,
        slug: row.roomSlug,
        title: row.roomTitle,
      },
      summaryUrl: `/r/${row.roomSlug}/summary?meetingId=${row.id}`,
    };
  });

  return NextResponse.json({ meetings: list });
}
