import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings, transcriptSegments } from "@/db/schema";
import { callGeminiSafe, extractJsonBlock } from "@/lib/gemini";
import { localePromptLabel, resolveLocale } from "@/lib/app-settings";
import {
  appendInsightsHistory,
  currentPayloadFromCache,
  INSIGHTS_MAX_OUTPUT_TOKENS,
  INSIGHTS_TRANSCRIPT_LIMIT,
  isInsightsTimeFresh,
  parseInsightsCache,
  randomInsightsIntervalMs,
  type InsightsCacheDocument,
  type InsightsPayload,
} from "@/lib/insights-cache";
import {
  INSIGHTS_CACHE_MIN_NEW_SEGMENTS,
  MAX_INSIGHTS_REGEN_PER_MEETING,
  recordLlmUsage,
} from "@/lib/llm-usage";
import { getSession } from "@/lib/session";

const schema = z.object({
  meetingId: z.string().uuid(),
  limit: z.number().int().min(5).max(80).optional(),
  /** Force a new Gemini call even if cache is fresh. */
  force: z.boolean().optional(),
  agentSecret: z.string().optional(),
});

function authorize(req: NextRequest, bodySecret?: string) {
  const expected = process.env.AGENT_SHARED_SECRET;
  if (!expected) return true;
  const header = req.headers.get("x-agent-secret");
  return header === expected || bodySecret === expected;
}

type CachedInsights = InsightsPayload & {
  cached?: boolean;
  segmentCount?: number;
  regenCount?: number;
  warning?: string;
  nextAllowedAt?: string;
  agenda?: string;
};

function jsonFromCache(
  cache: InsightsCacheDocument | null,
  opts: {
    segmentCount: number;
    regenCount: number;
    cached: boolean;
    warning?: string;
  },
): CachedInsights {
  return {
    ...currentPayloadFromCache(cache),
    cached: opts.cached,
    segmentCount: opts.segmentCount,
    regenCount: opts.regenCount,
    nextAllowedAt: cache?.nextAllowedAt,
    agenda: cache?.agenda,
    ...(opts.warning ? { warning: opts.warning } : {}),
  };
}

async function tryClaimInsights(meetingId: string): Promise<boolean> {
  const updated = await db
    .update(meetings)
    .set({ insightsStatus: "running" })
    .where(
      and(eq(meetings.id, meetingId), ne(meetings.insightsStatus, "running")),
    )
    .returning({ id: meetings.id });
  return updated.length > 0;
}

async function releaseInsights(meetingId: string) {
  await db
    .update(meetings)
    .set({ insightsStatus: "idle" })
    .where(eq(meetings.id, meetingId));
}

export type { InsightsPayload };

export async function POST(req: NextRequest) {
  const body = schema.parse(await req.json());
  const session = await getSession();
  const asAgent = authorize(req, body.agentSecret);
  if (!asAgent && !session.isLoggedIn) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, body.meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const segmentRows = await db
    .select({ n: count() })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meeting.id));
  const segmentCount = Number(segmentRows[0]?.n ?? 0);

  const cache = parseInsightsCache(meeting.insightsCache);
  const cachedSeg = meeting.insightsCacheSegmentCount ?? 0;
  const timeFresh = isInsightsTimeFresh(cache);
  const noNewSegments =
    cache != null &&
    segmentCount - cachedSeg < INSIGHTS_CACHE_MIN_NEW_SEGMENTS;

  if (!body.force && cache && (timeFresh || noNewSegments)) {
    return NextResponse.json(
      jsonFromCache(cache, {
        segmentCount,
        regenCount: meeting.insightsRegenCount,
        cached: true,
      }),
    );
  }

  if (
    body.force &&
    meeting.insightsRegenCount >= MAX_INSIGHTS_REGEN_PER_MEETING
  ) {
    return NextResponse.json(
      {
        error: "insights_quota",
        message: `Limite de ${MAX_INSIGHTS_REGEN_PER_MEETING} actualizações de insights nesta reunião.`,
        ...jsonFromCache(cache, {
          segmentCount,
          regenCount: meeting.insightsRegenCount,
          cached: true,
        }),
      },
      { status: 429 },
    );
  }

  // Another participant already generating for this meeting — return cache.
  if (meeting.insightsStatus === "running") {
    return NextResponse.json(
      jsonFromCache(cache, {
        segmentCount,
        regenCount: meeting.insightsRegenCount,
        cached: true,
      }),
    );
  }

  const claimed = await tryClaimInsights(meeting.id);
  if (!claimed) {
    return NextResponse.json(
      jsonFromCache(cache, {
        segmentCount,
        regenCount: meeting.insightsRegenCount,
        cached: true,
      }),
    );
  }

  try {
    const limit = body.limit ?? INSIGHTS_TRANSCRIPT_LIMIT;
    const segments = await db.query.transcriptSegments.findMany({
      where: eq(transcriptSegments.meetingId, meeting.id),
      orderBy: [desc(transcriptSegments.createdAt)],
      limit,
    });
    const chronological = [...segments].reverse();
    const transcript = chronological
      .map((s) => `${s.speakerLabel}: ${s.text}`)
      .join("\n");

    if (!transcript.trim()) {
      return NextResponse.json(
        jsonFromCache(cache, {
          segmentCount,
          regenCount: meeting.insightsRegenCount,
          cached: Boolean(cache),
        }),
      );
    }

    const locale = await resolveLocale();
    const lang = localePromptLabel(locale);
    const prevAgenda = cache?.agenda?.trim();
    const prompt = `Você é o copiloto OpenMeet durante uma reunião ao vivo (${lang}).
Actualize a pauta com base no delta recente da transcrição.
Produza no máximo 3 itens curtos por categoria. Seja concreto — evite generalidades.
Escreva em ${lang}.

${prevAgenda ? `Pauta actual:\n${prevAgenda}\n` : ""}
Transcrição recente (delta):
${transcript}

Responda APENAS com um bloco <insights>...</insights> contendo JSON:
{
  "agenda": "1-2 frases com a pauta/corrente da reunião",
  "insights": ["..."],
  "observations": ["..."],
  "suggestions": ["..."]
}`;

    const gemini = await callGeminiSafe(prompt, {
      maxOutputTokens: INSIGHTS_MAX_OUTPUT_TOKENS,
    });
    void recordLlmUsage({
      meetingId: meeting.id,
      feature: "insights",
      gemini,
    });

    if (gemini.offline || !gemini.text.trim()) {
      return NextResponse.json(
        jsonFromCache(cache, {
          segmentCount,
          regenCount: meeting.insightsRegenCount,
          cached: Boolean(cache),
          warning: gemini.error,
        }),
      );
    }

    type GeminiInsights = InsightsPayload & { agenda?: string };
    const { data } = extractJsonBlock<GeminiInsights>(gemini.text, "insights");
    const payload: InsightsPayload & { agenda?: string } = {
      insights: Array.isArray(data?.insights) ? data!.insights.slice(0, 3) : [],
      observations: Array.isArray(data?.observations)
        ? data!.observations.slice(0, 3)
        : [],
      suggestions: Array.isArray(data?.suggestions)
        ? data!.suggestions.slice(0, 3)
        : [],
      agenda:
        typeof data?.agenda === "string" && data.agenda.trim()
          ? data.agenda.trim().slice(0, 400)
          : prevAgenda,
    };

    const now = new Date();
    const nextAllowedAt = new Date(now.getTime() + randomInsightsIntervalMs());
    const nextDoc = appendInsightsHistory(cache, payload, now, nextAllowedAt);
    const nextRegen = body.force
      ? meeting.insightsRegenCount + 1
      : meeting.insightsRegenCount;

    await db
      .update(meetings)
      .set({
        insightsCache: nextDoc,
        insightsCacheSegmentCount: segmentCount,
        insightsCacheAt: sql`now()`,
        insightsRegenCount: nextRegen,
        insightsStatus: "idle",
      })
      .where(eq(meetings.id, meeting.id));

    return NextResponse.json(
      jsonFromCache(nextDoc, {
        segmentCount,
        regenCount: nextRegen,
        cached: false,
      }),
    );
  } catch (err) {
    console.error("[openmeet] insights generation failed", err);
    await releaseInsights(meeting.id);
    return NextResponse.json(
      jsonFromCache(cache, {
        segmentCount,
        regenCount: meeting.insightsRegenCount,
        cached: Boolean(cache),
        warning: err instanceof Error ? err.message : "insights_failed",
      }),
      { status: 500 },
    );
  } finally {
    // Ensure lock released if we returned early without writing idle.
    const again = await db.query.meetings.findFirst({
      where: eq(meetings.id, meeting.id),
      columns: { insightsStatus: true },
    });
    if (again?.insightsStatus === "running") {
      await releaseInsights(meeting.id);
    }
  }
}
