import { describe, expect, it, vi } from "vitest";
import { needsExpandedContext } from "@/lib/copilot-chat-prompt";
import {
  sampleTranscriptForSummary,
  SUMMARY_TRANSCRIPT_CHAR_CAP,
} from "@/lib/transcript-sample";

vi.mock("@/lib/app-settings", () => ({
  resolveAiConfig: vi.fn(async () => ({
    apiKey: "test",
    model: "gemini-3.5-flash-lite",
  })),
}));

import { estimateTokens, defaultGeminiModel, summaryGeminiModel } from "@/lib/gemini";

describe("needsExpandedContext", () => {
  it("expands for summary-like questions", () => {
    expect(needsExpandedContext("resume a reunião")).toBe(true);
    expect(needsExpandedContext("Quem falou sobre o contrato?")).toBe(true);
    expect(needsExpandedContext("lista os principais pontos")).toBe(true);
  });

  it("keeps default for short factual questions", () => {
    expect(needsExpandedContext("qual a pauta?")).toBe(false);
    expect(needsExpandedContext("obrigado")).toBe(false);
  });
});

describe("sampleTranscriptForSummary", () => {
  it("returns short transcripts unchanged", () => {
    const t = "Ana: oi\nCaio: ola";
    expect(sampleTranscriptForSummary(t)).toBe(t);
  });

  it("caps long transcripts with middle markers", () => {
    const line = "Speaker: " + "x".repeat(200) + "\n";
    const long = line.repeat(100);
    const sampled = sampleTranscriptForSummary(long);
    expect(sampled.length).toBeLessThanOrEqual(SUMMARY_TRANSCRIPT_CHAR_CAP + 200);
    expect(sampled).toContain("omitido");
  });
});

describe("estimateTokens", () => {
  it("estimates roughly 4 chars per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});

describe("defaultGeminiModel", () => {
  it("defaults to flash-lite when env unset", () => {
    const prev = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL;
    expect(defaultGeminiModel()).toBe("gemini-3.5-flash-lite");
    if (prev !== undefined) process.env.GEMINI_MODEL = prev;
  });
});

describe("summaryGeminiModel", () => {
  it("defaults to stronger flash (not lite) when env unset", () => {
    const prev = process.env.GEMINI_SUMMARY_MODEL;
    const prevLite = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_SUMMARY_MODEL;
    delete process.env.GEMINI_MODEL;
    expect(summaryGeminiModel()).toBe("gemini-3.5-flash");
    if (prev !== undefined) process.env.GEMINI_SUMMARY_MODEL = prev;
    if (prevLite !== undefined) process.env.GEMINI_MODEL = prevLite;
  });
});
