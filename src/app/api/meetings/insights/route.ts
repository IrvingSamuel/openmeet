import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings, transcriptSegments } from "@/db/schema";
import { callGeminiSafe, extractJsonBlock } from "@/lib/gemini";
import { localePromptLabel, resolveLocale } from "@/lib/app-settings";
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

export type InsightsPayload = {
  insights: string[];
  observations: string[];
  suggestions: string[];
};

type CachedInsights = InsightsPayload & {
  cached?: boolean;
  segmentCount?: number;
  regenCount?: number;
  warning?: string;
};

function isInsightsPayload(value: unknown): value is InsightsPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.insights) &&
    Array.isArray(v.observations) &&
    Array.isArray(v.suggestions)
  );
}

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

  const cached = isInsightsPayload(meeting.insightsCache)
    ? (meeting.insightsCache as InsightsPayload)
    : null;
  const cachedSeg = meeting.insightsCacheSegmentCount ?? 0;
  const cacheFresh =
    cached &&
    segmentCount - cachedSeg < INSIGHTS_CACHE_MIN_NEW_SEGMENTS;

  if (!body.force && cacheFresh && cached) {
    return NextResponse.json({
      ...cached,
      cached: true,
      segmentCount,
      regenCount: meeting.insightsRegenCount,
    } satisfies CachedInsights);
  }

  if (
    body.force &&
    meeting.insightsRegenCount >= MAX_INSIGHTS_REGEN_PER_MEETING
  ) {
    return NextResponse.json(
      {
        error: "insights_quota",
        message: `Limite de ${MAX_INSIGHTS_REGEN_PER_MEETING} actualizações de insights nesta reunião.`,
        ...(cached
          ? {
              ...cached,
              cached: true,
              segmentCount,
              regenCount: meeting.insightsRegenCount,
            }
          : {}),
      },
      { status: 429 },
    );
  }

  const limit = body.limit ?? 40;
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
    return NextResponse.json({
      insights: [],
      observations: [],
      suggestions: [],
      cached: false,
      segmentCount,
      regenCount: meeting.insightsRegenCount,
    } satisfies CachedInsights);
  }

  const locale = await resolveLocale();
  const lang = localePromptLabel(locale);
  const prompt = `Você é o copiloto Chronos Meet durante uma reunião ao vivo (${lang}).
Com base na transcrição recente, produza no máximo 3 itens curtos por categoria.
Seja concreto e útil — evite generalidades.
Escreva os itens em ${lang}.

Transcrição recente:
${transcript}

Responda APENAS com um bloco <insights>...</insights> contendo JSON:
{
  "insights": ["..."],
  "observations": ["..."],
  "suggestions": ["..."]
}`;

  const gemini = await callGeminiSafe(prompt, { maxOutputTokens: 512 });
  void recordLlmUsage({
    meetingId: meeting.id,
    feature: "insights",
    gemini,
  });

  if (gemini.offline || !gemini.text.trim()) {
    return NextResponse.json({
      insights: [],
      observations: gemini.billingDepleted
        ? ["Gemini sem créditos — insights temporariamente indisponíveis."]
        : gemini.error
          ? ["Gemini indisponível — verifique modelo/API key no servidor."]
          : [],
      suggestions: [],
      warning: gemini.error,
      cached: false,
      segmentCount,
      regenCount: meeting.insightsRegenCount,
    } satisfies CachedInsights);
  }

  const { data } = extractJsonBlock<InsightsPayload>(gemini.text, "insights");
  const payload: InsightsPayload = {
    insights: Array.isArray(data?.insights) ? data!.insights.slice(0, 3) : [],
    observations: Array.isArray(data?.observations)
      ? data!.observations.slice(0, 3)
      : [],
    suggestions: Array.isArray(data?.suggestions)
      ? data!.suggestions.slice(0, 3)
      : [],
  };

  const nextRegen = body.force
    ? meeting.insightsRegenCount + 1
    : meeting.insightsRegenCount;

  await db
    .update(meetings)
    .set({
      insightsCache: payload,
      insightsCacheSegmentCount: segmentCount,
      insightsCacheAt: sql`now()`,
      insightsRegenCount: nextRegen,
    })
    .where(eq(meetings.id, meeting.id));

  return NextResponse.json({
    ...payload,
    cached: false,
    segmentCount,
    regenCount: nextRegen,
  } satisfies CachedInsights);
}
