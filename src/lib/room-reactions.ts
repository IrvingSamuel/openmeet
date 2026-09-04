export const REACTIONS_TOPIC = "room-reactions";

export const REACTION_RATE_LIMIT_MS = 700;

export const PRESET_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🎉",
  "👏",
  "🔥",
  "💯",
  "✨",
  "🙌",
  "😮",
  "💡",
  "🎯",
] as const;

export type ReactionEvent = {
  id: string;
  emoji: string;
  displayName: string;
  identity: string;
  at: number;
};

export type ReactionBurst = ReactionEvent & {
  startX: number;
  driftX: number;
  rotation: number;
  wobble: number;
  duration: number;
};

const MAX_EMOJI_GRAPHEMES = 2;

let unicodeEmojiPattern: RegExp | null = null;
let unicodeEmojiPatternChecked = false;

/** Lazy compile — avoids SyntaxError on engines without Unicode property escapes. */
function getUnicodeEmojiPattern(): RegExp | null {
  if (unicodeEmojiPatternChecked) return unicodeEmojiPattern;
  unicodeEmojiPatternChecked = true;
  try {
    unicodeEmojiPattern = new RegExp(
      "^(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)(?:\\u200D(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F))*$",
      "u",
    );
  } catch {
    unicodeEmojiPattern = null;
  }
  return unicodeEmojiPattern;
}

function isEmojiGraphemeFallback(g: string): boolean {
  if (PRESET_REACTION_EMOJIS.includes(g as (typeof PRESET_REACTION_EMOJIS)[number])) {
    return true;
  }
  if (!g.trim()) return false;
  for (const ch of g) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x2300 && ch !== "\u200D") return false;
  }
  return true;
}

function isEmojiGrapheme(g: string): boolean {
  const pattern = getUnicodeEmojiPattern();
  if (pattern) {
    try {
      return pattern.test(g);
    } catch {
      return isEmojiGraphemeFallback(g);
    }
  }
  return isEmojiGraphemeFallback(g);
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(text)].map((s) => s.segment);
  }
  return [...text];
}

/** Allow emoji / pictographic graphemes only; max 2 graphemes. */
export function sanitizeEmoji(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const graphemes = splitGraphemes(trimmed).filter((g) => g.trim().length > 0);
  if (graphemes.length === 0 || graphemes.length > MAX_EMOJI_GRAPHEMES) {
    return null;
  }
  for (const g of graphemes) {
    if (!isEmojiGrapheme(g)) return null;
  }
  return graphemes.join("");
}

export function encodeReaction(event: ReactionEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event));
}

export function parseReaction(
  payload: Uint8Array | ArrayBuffer | ArrayLike<number>,
): ReactionEvent | null {
  try {
    const bytes =
      payload instanceof Uint8Array
        ? payload
        : new Uint8Array(
            payload instanceof ArrayBuffer ? payload : Array.from(payload),
          );
    const json = JSON.parse(new TextDecoder().decode(bytes)) as ReactionEvent;
    if (
      !json ||
      typeof json.id !== "string" ||
      typeof json.emoji !== "string" ||
      typeof json.displayName !== "string" ||
      typeof json.identity !== "string" ||
      typeof json.at !== "number"
    ) {
      return null;
    }
    const emoji = sanitizeEmoji(json.emoji);
    if (!emoji) return null;
    return { ...json, emoji };
  } catch {
    return null;
  }
}

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededUnit(seed: number, salt: number): number {
  const x = Math.sin(seed + salt * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function burstFromEvent(event: ReactionEvent): ReactionBurst {
  const seed = seedFromId(event.id);
  const startX = 12 + seededUnit(seed, 1) * 76;
  const driftSign = seededUnit(seed, 2) > 0.5 ? 1 : -1;
  const driftMag = 40 + seededUnit(seed, 3) * 70;
  const rotation = (seededUnit(seed, 4) - 0.5) * 36;
  const wobble = (seededUnit(seed, 5) - 0.5) * 24;
  const duration = 8.5 + seededUnit(seed, 6) * 1.5;
  return {
    ...event,
    startX,
    driftX: driftSign * driftMag,
    rotation,
    wobble,
    duration,
  };
}

export function newReactionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 12);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
