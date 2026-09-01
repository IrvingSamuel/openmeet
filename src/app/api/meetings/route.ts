import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  actionItems,
  meetingSummaries,
  meetings,
  participants,
} from "@/db/schema";
import { scheduleMeetingReconcile } from "@/lib/meeting-lifecycle";
import { getSession } from "@/lib/session";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

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
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || DEFAULT_LIMIT);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_LIMIT),
  );

  scheduleMeetingReconcile();

  const participated = await db
    .selectDistinct({ meetingId: participants.meetingId })
    .from(participants)
    .where(eq(participants.identityId, identityId));

  const participatedMeetingIds = participated.map((p) => p.meetingId);

  const filters = [eq(meetings.ownerIdentityId, identityId)];
  if (participatedMeetingIds.length > 0) {
    filters.push(inArray(meetings.id, participatedMeetingIds));
  }

  const whereClause = filters.length === 1 ? filters[0]! : or(...filters);

  const rows = await db
    .select({
      id: meetings.id,
      slug: meetings.slug,
      title: meetings.title,
      roomId: meetings.roomId,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      status: meetings.status,
      summaryStatus: meetings.summaryStatus,
      ownerIdentityId: meetings.ownerIdentityId,
      summaryMarkdown: meetingSummaries.summaryMarkdown,
      summaryModel: meetingSummaries.model,
      summaryCreatedAt: meetingSummaries.createdAt,
      actionItemCount: sql<number>`(
        select count(*)::int from ${actionItems}
        where ${actionItems.meetingId} = ${meetings.id}
      )`,
    })
    .from(meetings)
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
    const isOwner = row.ownerIdentityId === identityId;

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
        slug: row.slug,
        title: row.title,
      },
      summaryUrl: `/m/${row.slug}/summary?meetingId=${row.id}`,
    };
  });

  return NextResponse.json({ meetings: list });
}
