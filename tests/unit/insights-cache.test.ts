// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPersonalBoard } from "@/lib/boards";
import {
  appendInsightsHistory,
  formatInsightsHistoryForPrompt,
  isInsightsTimeFresh,
  parseInsightsCache,
  randomInsightsIntervalMs,
  INSIGHTS_MIN_INTERVAL_MS,
  INSIGHTS_MAX_INTERVAL_MS,
} from "@/lib/insights-cache";

describe("insights-cache", () => {
  it("parses legacy payload without history", () => {
    const cache = parseInsightsCache({
      insights: ["a"],
      observations: ["b"],
      suggestions: ["c"],
    });
    expect(cache?.insights).toEqual(["a"]);
    expect(cache?.history).toEqual([]);
  });

  it("treats nextAllowedAt as fresh until elapsed", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 1_000).toISOString();
    expect(
      isInsightsTimeFresh({
        insights: [],
        observations: [],
        suggestions: [],
        nextAllowedAt: future,
      }),
    ).toBe(true);
    expect(
      isInsightsTimeFresh({
        insights: [],
        observations: [],
        suggestions: [],
        nextAllowedAt: past,
      }),
    ).toBe(false);
  });

  it("appends history and sets nextAllowedAt", () => {
    const next = new Date("2030-01-01T00:02:00.000Z");
    const doc = appendInsightsHistory(
      null,
      {
        insights: ["i1"],
        observations: [],
        suggestions: [],
        agenda: "pauta X",
      },
      new Date("2030-01-01T00:00:00.000Z"),
      next,
    );
    expect(doc.history).toHaveLength(1);
    expect(doc.agenda).toBe("pauta X");
    expect(doc.nextAllowedAt).toBe(next.toISOString());
  });

  it("formats history for summary prompt", () => {
    const text = formatInsightsHistoryForPrompt({
      insights: ["curr"],
      observations: [],
      suggestions: [],
      history: [
        {
          at: "2030-01-01T00:00:00.000Z",
          insights: ["old insight"],
          observations: [],
          suggestions: [],
          agenda: "kickoff",
        },
      ],
    });
    expect(text).toContain("old insight");
    expect(text).toContain("kickoff");
  });

  it("random interval stays within 1–3 minutes", () => {
    for (let i = 0; i < 40; i++) {
      const ms = randomInsightsIntervalMs();
      expect(ms).toBeGreaterThanOrEqual(INSIGHTS_MIN_INTERVAL_MS);
      expect(ms).toBeLessThanOrEqual(INSIGHTS_MAX_INTERVAL_MS);
    }
  });
});

describe("isPersonalBoard", () => {
  it("detects is_shared false as personal", () => {
    expect(isPersonalBoard({ id: "1", is_shared: false, member_count: 5 })).toBe(
      true,
    );
  });

  it("uses member_count fallback when is_shared missing", () => {
    expect(isPersonalBoard({ id: "1", member_count: 1 })).toBe(true);
    expect(isPersonalBoard({ id: "1", member_count: 3 })).toBe(false);
  });

  it("treats shared boards as not personal", () => {
    expect(isPersonalBoard({ id: "1", is_shared: true, member_count: 1 })).toBe(
      false,
    );
  });
});
