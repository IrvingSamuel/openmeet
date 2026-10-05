export type Caption = {
  speaker: string;
  text: string;
  final?: boolean;
  participantId?: string;
};

let captionStripPattern: RegExp | null = null;
let captionStripPatternChecked = false;

/** Test-only: clear lazy regex cache so Unicode-fallback paths can be exercised. */
export function resetCaptionStripPatternCache() {
  captionStripPattern = null;
  captionStripPatternChecked = false;
}

/**
 * Lazy compile — avoids SyntaxError on engines without Unicode property escapes
 * (same approach as room-reactions.ts).
 */
function getCaptionStripPattern(): RegExp | null {
  if (captionStripPatternChecked) return captionStripPattern;
  captionStripPatternChecked = true;
  try {
    captionStripPattern = new RegExp("[^\\p{L}\\p{N}\\s]", "gu");
  } catch {
    captionStripPattern = null;
  }
  return captionStripPattern;
}

/** ASCII + Latin-1 supplement letters/digits when \\p{} is unavailable. */
function stripCaptionPunctuationFallback(text: string): string {
  return text.replace(/[^a-zA-Z0-9\s\u00C0-\u024F]/g, "");
}

function normalizeCaptionText(text: string): string {
  const collapsed = text.toLowerCase().trim().replace(/\s+/g, " ");
  const pattern = getCaptionStripPattern();
  if (pattern) {
    try {
      return collapsed.replace(pattern, "");
    } catch {
      return stripCaptionPunctuationFallback(collapsed);
    }
  }
  return stripCaptionPunctuationFallback(collapsed);
}

/** True when two caption bodies are near-duplicates (mic bleed on another track). */
export function captionsSimilar(
  a: string,
  b: string,
  threshold = 0.85,
): boolean {
  try {
    const na = normalizeCaptionText(a);
    const nb = normalizeCaptionText(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const maxLen = Math.max(na.length, nb.length);
    let matches = 0;
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length <= nb.length ? nb : na;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) matches += 1;
    }
    return matches / maxLen >= threshold;
  } catch {
    return false;
  }
}

/** Decodes a `captions` data-channel payload, tolerating malformed frames. */
export function parseCaption(payload: Uint8Array): Caption | null {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    const data = JSON.parse(decoded) as Partial<Caption>;
    if (typeof data.text !== "string" || data.text.trim() === "") return null;
    return {
      speaker: typeof data.speaker === "string" ? data.speaker : "Participante",
      text: data.text,
      final: Boolean(data.final),
      participantId:
        typeof data.participantId === "string" ? data.participantId : undefined,
    };
  } catch {
    return null;
  }
}

export type InsightKind = "insight" | "observation" | "suggestion";

export type CopilotInsight = {
  kind: InsightKind;
  text: string;
  at?: number;
};

/** Decodes an `insights` data-channel payload. */
export function parseInsights(payload: Uint8Array): CopilotInsight[] {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    const data = JSON.parse(decoded) as {
      insights?: string[];
      observations?: string[];
      suggestions?: string[];
      at?: number;
    };
    const at = typeof data.at === "number" ? data.at : Date.now();
    const out: CopilotInsight[] = [];
    for (const text of data.insights ?? []) {
      if (typeof text === "string" && text.trim())
        out.push({ kind: "insight", text: text.trim(), at });
    }
    for (const text of data.observations ?? []) {
      if (typeof text === "string" && text.trim())
        out.push({ kind: "observation", text: text.trim(), at });
    }
    for (const text of data.suggestions ?? []) {
      if (typeof text === "string" && text.trim())
        out.push({ kind: "suggestion", text: text.trim(), at });
    }
    return out;
  } catch {
    return [];
  }
}
