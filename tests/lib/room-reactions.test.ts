import { describe, it, expect } from "vitest";
import {
  sanitizeEmoji,
  burstFromEvent,
  parseReaction,
  encodeReaction,
  PRESET_REACTION_EMOJIS,
} from "@/lib/room-reactions";

describe("room-reactions", () => {
  it("sanitizes preset emojis", () => {
    for (const emoji of PRESET_REACTION_EMOJIS) {
      expect(sanitizeEmoji(emoji)).toBe(emoji);
    }
  });

  it("rejects ascii text", () => {
    expect(sanitizeEmoji("abc")).toBeNull();
  });

  it("does not throw when Unicode property escapes are unavailable", () => {
    const original = RegExp.prototype.test;
    RegExp.prototype.test = function (str: string) {
      if (this.source.includes("\\p{")) {
        throw new SyntaxError("Invalid regular expression");
      }
      return original.call(this, str);
    };
    try {
      expect(sanitizeEmoji("👍")).toBe("👍");
      expect(sanitizeEmoji("abc")).toBeNull();
    } finally {
      RegExp.prototype.test = original;
    }
  });

  it("burstFromEvent produces valid params", () => {
    const e = {
      id: "test-id-123",
      emoji: "👍",
      displayName: "Alice",
      identity: "a",
      at: Date.now(),
    };
    const burst = burstFromEvent(e);
    expect(burst.startX).toBeGreaterThanOrEqual(12);
    expect(burst.startX).toBeLessThanOrEqual(88);
    expect(burst.duration).toBeGreaterThan(2.5);
  });

  it("encode/parse roundtrip", () => {
    const event = {
      id: "x1",
      emoji: "🎉",
      displayName: "Bob",
      identity: "b",
      at: 123,
    };
    const parsed = parseReaction(encodeReaction(event));
    expect(parsed).toEqual({ ...event, emoji: "🎉" });
  });
});
