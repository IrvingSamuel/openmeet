export type Caption = {
  speaker: string;
  text: string;
  final?: boolean;
  participantId?: string;
};

function normalizeCaptionText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

/** True when two caption bodies are near-duplicates (mic bleed on another track). */
export function captionsSimilar(
  a: string,
  b: string,
  threshold = 0.85,
): boolean {
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
