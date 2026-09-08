/** Shared shapes + helpers for live meeting insights cache. */

export type InsightsPayload = {
  insights: string[];
  observations: string[];
  suggestions: string[];
};

export type InsightsHistoryEntry = InsightsPayload & {
  at: string;
  agenda?: string;
};

export type InsightsCacheDocument = InsightsPayload & {
  /** Short running agenda / pauta for the next generation. */
  agenda?: string;
  /** ISO timestamp — next non-forced Gemini call allowed at/after this. */
  nextAllowedAt?: string;
  history?: InsightsHistoryEntry[];
};

export const INSIGHTS_MIN_INTERVAL_MS = 60_000;
export const INSIGHTS_MAX_INTERVAL_MS = 180_000;
/** Recent transcript window for live insights (economy). */
export const INSIGHTS_TRANSCRIPT_LIMIT = 20;
export const INSIGHTS_MAX_OUTPUT_TOKENS = 384;
export const INSIGHTS_HISTORY_CAP = 24;

export function randomInsightsIntervalMs(
  min = INSIGHTS_MIN_INTERVAL_MS,
  max = INSIGHTS_MAX_INTERVAL_MS,
): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function isInsightsPayload(value: unknown): value is InsightsPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.insights) &&
    Array.isArray(v.observations) &&
    Array.isArray(v.suggestions)
  );
}

export function parseInsightsCache(value: unknown): InsightsCacheDocument | null {
  if (!isInsightsPayload(value)) return null;
  const v = value as Record<string, unknown>;
  const history = Array.isArray(v.history)
    ? (v.history as InsightsHistoryEntry[]).filter(
        (h) => h && isInsightsPayload(h) && typeof h.at === "string",
      )
    : [];
  return {
    insights: v.insights as string[],
    observations: v.observations as string[],
    suggestions: v.suggestions as string[],
    agenda: typeof v.agenda === "string" ? v.agenda : undefined,
    nextAllowedAt:
      typeof v.nextAllowedAt === "string" ? v.nextAllowedAt : undefined,
    history,
  };
}

/** True when a non-forced generation should reuse cache (time window). */
export function isInsightsTimeFresh(
  cache: InsightsCacheDocument | null,
  now = Date.now(),
): boolean {
  if (!cache) return false;
  if (cache.nextAllowedAt) {
    const next = Date.parse(cache.nextAllowedAt);
    if (!Number.isNaN(next)) return now < next;
  }
  return false;
}

export function appendInsightsHistory(
  prev: InsightsCacheDocument | null,
  current: InsightsPayload & { agenda?: string },
  at = new Date(),
  nextAllowedAt: Date,
): InsightsCacheDocument {
  const entry: InsightsHistoryEntry = {
    at: at.toISOString(),
    insights: current.insights,
    observations: current.observations,
    suggestions: current.suggestions,
    ...(current.agenda ? { agenda: current.agenda } : {}),
  };
  const history = [...(prev?.history ?? []), entry].slice(-INSIGHTS_HISTORY_CAP);
  return {
    insights: current.insights,
    observations: current.observations,
    suggestions: current.suggestions,
    agenda: current.agenda,
    nextAllowedAt: nextAllowedAt.toISOString(),
    history,
  };
}

/** Flatten live insight history for the post-meeting summary prompt. */
export function formatInsightsHistoryForPrompt(
  cache: InsightsCacheDocument | null,
): string {
  if (!cache?.history?.length) {
    if (!cache) return "";
    const lines = [
      ...cache.insights.map((t) => `- [insight] ${t}`),
      ...cache.observations.map((t) => `- [observation] ${t}`),
      ...cache.suggestions.map((t) => `- [suggestion] ${t}`),
    ];
    return lines.length ? lines.join("\n") : "";
  }
  return cache.history
    .map((h) => {
      const when = h.at;
      const items = [
        ...h.insights.map((t) => `  - [insight] ${t}`),
        ...h.observations.map((t) => `  - [observation] ${t}`),
        ...h.suggestions.map((t) => `  - [suggestion] ${t}`),
      ];
      const agenda = h.agenda ? `  pauta: ${h.agenda}\n` : "";
      return `@ ${when}\n${agenda}${items.join("\n")}`;
    })
    .join("\n\n");
}

export function currentPayloadFromCache(
  cache: InsightsCacheDocument | null,
): InsightsPayload {
  return {
    insights: cache?.insights ?? [],
    observations: cache?.observations ?? [],
    suggestions: cache?.suggestions ?? [],
  };
}
