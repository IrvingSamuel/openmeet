import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "@/db";
import { meetings, participants, recordings, users } from "@/db/schema";
import { sumLlmUsageByFeature } from "@/lib/llm-usage";
import { getLiveKitHttpHost, getRoomServiceClient } from "@/lib/livekit";

export type DayBucket = { date: string; count: number };

function appVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgoUtc(n: number): Date {
  const d = startOfUtcDay();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function fillDailySeries(
  rows: Array<{ day: string; n: number }>,
  days: number,
): DayBucket[] {
  const map = new Map(rows.map((r) => [r.day, Number(r.n)]));
  const out: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoUtc(i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

async function probePostgres(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function probeLiveKit(): Promise<{
  ok: boolean;
  roomTotal: number | null;
}> {
  try {
    const host = getLiveKitHttpHost();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${host}/`, { signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    );
    let roomTotal: number | null = null;
    try {
      const rooms = await getRoomServiceClient().listRooms();
      roomTotal = rooms.length;
    } catch {
      roomTotal = null;
    }
    return { ok: res.ok || res.status < 500, roomTotal };
  } catch {
    return { ok: false, roomTotal: null };
  }
}

async function probeAgent(): Promise<boolean> {
  const port = process.env.AGENT_HTTP_PORT?.trim() || "8095";
  const url = `http://127.0.0.1:${port}/`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    );
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export async function getOpsStats() {
  const since30 = daysAgoUtc(29);
  const since7 = daysAgoUtc(6);
  const today = startOfUtcDay();

  const [
    postgresOk,
    livekit,
    agentOk,
    activeMeetingsRow,
    connectedParticipantsRow,
    userTotalRow,
    usersByVia,
    userSeriesRows,
    meetingSeriesRows,
    endedTodayRow,
    ended7Row,
    ended30Row,
    recordingRows,
    llm,
  ] = await Promise.all([
    probePostgres(),
    probeLiveKit(),
    probeAgent(),
    db
      .select({ n: count() })
      .from(meetings)
      .where(eq(meetings.status, "active")),
    db
      .select({ n: count() })
      .from(participants)
      .where(isNull(participants.leftAt)),
    db.select({ n: count() }).from(users),
    db
      .select({
        createdVia: users.createdVia,
        n: count(),
      })
      .from(users)
      .groupBy(users.createdVia),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${users.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(users)
      .where(gte(users.createdAt, since30))
      .groupBy(sql`date_trunc('day', ${users.createdAt} at time zone 'utc')`),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${meetings.endedAt} at time zone 'utc'), 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(meetings)
      .where(
        and(eq(meetings.status, "ended"), gte(meetings.endedAt, since30)),
      )
      .groupBy(sql`date_trunc('day', ${meetings.endedAt} at time zone 'utc')`),
    db
      .select({ n: count() })
      .from(meetings)
      .where(and(eq(meetings.status, "ended"), gte(meetings.endedAt, today))),
    db
      .select({ n: count() })
      .from(meetings)
      .where(and(eq(meetings.status, "ended"), gte(meetings.endedAt, since7))),
    db
      .select({ n: count() })
      .from(meetings)
      .where(and(eq(meetings.status, "ended"), gte(meetings.endedAt, since30))),
    db
      .select({
        status: recordings.status,
        n: count(),
        bytes: sql<number>`coalesce(sum(${recordings.bytes}), 0)`,
      })
      .from(recordings)
      .groupBy(recordings.status),
    sumLlmUsageByFeature(30),
  ]);

  const byCreatedVia: Record<string, number> = {};
  for (const row of usersByVia) {
    byCreatedVia[row.createdVia] = Number(row.n);
  }

  const recordingsByStatus: Record<string, number> = {};
  let totalBytes = 0;
  for (const row of recordingRows) {
    recordingsByStatus[row.status] = Number(row.n);
    totalBytes += Number(row.bytes ?? 0);
  }

  return {
    version: appVersion(),
    generatedAt: new Date().toISOString(),
    health: {
      postgres: postgresOk,
      livekit: livekit.ok,
      agent: agentOk,
    },
    now: {
      meetingsActive: Number(activeMeetingsRow[0]?.n ?? 0),
      participantsConnected: Number(connectedParticipantsRow[0]?.n ?? 0),
      livekitRooms: livekit.roomTotal,
    },
    users: {
      total: Number(userTotalRow[0]?.n ?? 0),
      byCreatedVia,
      series30d: fillDailySeries(
        userSeriesRows.map((r) => ({ day: r.day, n: Number(r.n) })),
        30,
      ),
    },
    meetings: {
      endedToday: Number(endedTodayRow[0]?.n ?? 0),
      ended7d: Number(ended7Row[0]?.n ?? 0),
      ended30d: Number(ended30Row[0]?.n ?? 0),
      series30d: fillDailySeries(
        meetingSeriesRows
          .filter((r) => r.day)
          .map((r) => ({ day: r.day, n: Number(r.n) })),
        30,
      ),
    },
    recordings: {
      byStatus: recordingsByStatus,
      totalBytes,
    },
    llm: llm.map((row) => ({
      feature: row.feature,
      calls: Number(row.calls),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
    })),
  };
}
