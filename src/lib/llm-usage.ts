import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { copilotChatMessages, llmUsage } from "@/db/schema";
import type { GeminiResult } from "@/lib/gemini";

export type LlmFeature = "insights" | "chat" | "summary";

export const MAX_CHAT_PER_MEETING_PER_PARTICIPANT = 20;
export const MAX_INSIGHTS_REGEN_PER_MEETING = 3;
/**
 * Secondary guard: skip Gemini if fewer than this many new transcript segments
 * arrived since the last cache (even after the time window).
 */
export const INSIGHTS_CACHE_MIN_NEW_SEGMENTS = 1;

export async function recordLlmUsage(opts: {
  meetingId?: string | null;
  feature: LlmFeature;
  gemini: Pick<
    GeminiResult,
    "model" | "estInputTokens" | "estOutputTokens"
  >;
  actorIdentity?: string | null;
}): Promise<void> {
  try {
    await db.insert(llmUsage).values({
      meetingId: opts.meetingId ?? null,
      feature: opts.feature,
      model: opts.gemini.model ?? null,
      estInputTokens: opts.gemini.estInputTokens ?? 0,
      estOutputTokens: opts.gemini.estOutputTokens ?? 0,
      actorIdentity: opts.actorIdentity ?? null,
    });
  } catch (err) {
    console.warn("[llm_usage] failed to record", err);
  }
}

/** Count user-role copilot chat messages for a participant in a meeting. */
export async function countParticipantChatMessages(
  meetingId: string,
  livekitIdentity: string,
): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(copilotChatMessages)
    .where(
      and(
        eq(copilotChatMessages.meetingId, meetingId),
        eq(copilotChatMessages.role, "user"),
        eq(copilotChatMessages.authorIdentity, livekitIdentity),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function assertChatQuota(
  meetingId: string,
  livekitIdentity: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const used = await countParticipantChatMessages(meetingId, livekitIdentity);
  if (used >= MAX_CHAT_PER_MEETING_PER_PARTICIPANT) {
    return {
      ok: false,
      error: `Limite de ${MAX_CHAT_PER_MEETING_PER_PARTICIPANT} perguntas ao Copiloto nesta reunião. Use o resumo pós-reunião para mais contexto.`,
    };
  }
  return { ok: true };
}

/** Rough monthly usage rollup (for ops / future dashboard). */
export async function sumLlmUsageByFeature(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db
    .select({
      feature: llmUsage.feature,
      calls: count(),
      inputTokens: sql<number>`coalesce(sum(${llmUsage.estInputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${llmUsage.estOutputTokens}), 0)`,
    })
    .from(llmUsage)
    .where(sql`${llmUsage.createdAt} >= ${since}`)
    .groupBy(llmUsage.feature);
}
