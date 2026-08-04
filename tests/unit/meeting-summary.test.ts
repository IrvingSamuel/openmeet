// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const meetingsFindFirst = vi.fn();
const roomsFindFirst = vi.fn();
const segmentsFindMany = vi.fn();
const insertValues = vi.fn();
const onConflictDoUpdate = vi.fn();
const deleteWhere = vi.fn();
const updateWhere = vi.fn();
const callGeminiSafe = vi.fn();
const recordLlmUsage = vi.fn();
const dispatchSummaryReadyWebhooks = vi.fn();
const resolveLocale = vi.fn(async () => "pt-BR");

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
      rooms: {
        findFirst: (...args: unknown[]) => roomsFindFirst(...args),
      },
      transcriptSegments: {
        findMany: (...args: unknown[]) => segmentsFindMany(...args),
      },
    },
    insert: () => ({
      values: (...args: unknown[]) => {
        insertValues(...args);
        return {
          onConflictDoUpdate: (...cArgs: unknown[]) => {
            onConflictDoUpdate(...cArgs);
            return Promise.resolve(undefined);
          },
          returning: () => Promise.resolve([{}]),
        };
      },
    }),
    delete: () => ({
      where: (...args: unknown[]) => deleteWhere(...args),
    }),
    update: () => ({
      set: () => ({
        where: (...args: unknown[]) => updateWhere(...args),
      }),
    }),
  },
}));

vi.mock("@/lib/gemini", () => ({
  callGeminiSafe: (...args: unknown[]) => callGeminiSafe(...args),
  extractJsonBlock: vi.fn(),
  offlineSummaryMarkdown: vi.fn(),
  resolveSummaryGeminiModel: vi.fn(async () => "gemini-test"),
}));

vi.mock("@/lib/app-settings", () => ({
  resolveLocale: () => resolveLocale(),
  localePromptLabel: (locale: string) => locale,
}));

vi.mock("@/lib/llm-usage", () => ({
  recordLlmUsage: (...args: unknown[]) => recordLlmUsage(...args),
}));

vi.mock("@/lib/outbound-webhooks", () => ({
  dispatchSummaryReadyWebhooks: (...args: unknown[]) =>
    dispatchSummaryReadyWebhooks(...args),
}));

import {
  emptyTranscriptSummaryMarkdown,
  generateMeetingSummary,
} from "@/lib/meeting-summary";

describe("emptyTranscriptSummaryMarkdown", () => {
  it("returns locale-aware no-audio messages", () => {
    expect(emptyTranscriptSummaryMarkdown("pt-BR")).toBe(
      "Nenhum áudio foi detectado nesta reunião.",
    );
    expect(emptyTranscriptSummaryMarkdown("en")).toBe(
      "No audio was detected in this meeting.",
    );
    expect(emptyTranscriptSummaryMarkdown("es")).toBe(
      "No se detectó audio en esta reunión.",
    );
    expect(emptyTranscriptSummaryMarkdown("fr")).toBe(
      "Aucun audio n'a été détecté dans cette réunion.",
    );
    expect(emptyTranscriptSummaryMarkdown("de")).toBe(
      "In diesem Meeting wurde kein Audio erkannt.",
    );
  });

  it("falls back to Portuguese for unknown locales", () => {
    expect(emptyTranscriptSummaryMarkdown("ja")).toBe(
      "Nenhum áudio foi detectado nesta reunião.",
    );
  });
});

describe("generateMeetingSummary — empty transcript", () => {
  const meetingId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    meetingsFindFirst.mockReset();
    roomsFindFirst.mockReset();
    segmentsFindMany.mockReset();
    insertValues.mockReset();
    onConflictDoUpdate.mockReset();
    deleteWhere.mockReset();
    updateWhere.mockReset();
    callGeminiSafe.mockReset();
    recordLlmUsage.mockReset();
    dispatchSummaryReadyWebhooks.mockReset();
    resolveLocale.mockReset();
    resolveLocale.mockResolvedValue("pt-BR");
    deleteWhere.mockResolvedValue(undefined);
    updateWhere.mockResolvedValue(undefined);
    dispatchSummaryReadyWebhooks.mockResolvedValue(undefined);
  });

  it("skips Gemini and saves a no-audio report when there are no segments", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
    });
    roomsFindFirst.mockResolvedValue({
      id: "room-1",
      boardId: null,
    });
    segmentsFindMany.mockResolvedValue([]);

    const result = await generateMeetingSummary(meetingId);

    expect(callGeminiSafe).not.toHaveBeenCalled();
    expect(recordLlmUsage).not.toHaveBeenCalled();
    expect(result.summaryMarkdown).toBe(
      "Nenhum áudio foi detectado nesta reunião.",
    );
    expect(result.actionItems).toEqual([]);
    expect(result.offline).toBe(false);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId,
        summaryMarkdown: "Nenhum áudio foi detectado nesta reunião.",
        model: "skipped-no-transcript",
      }),
    );
    expect(dispatchSummaryReadyWebhooks).toHaveBeenCalledWith(meetingId);
  });

  it("uses English copy when app locale is en", async () => {
    resolveLocale.mockResolvedValue("en");
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      roomId: "room-1",
    });
    roomsFindFirst.mockResolvedValue({ id: "room-1", boardId: null });
    segmentsFindMany.mockResolvedValue([]);

    const result = await generateMeetingSummary(meetingId);

    expect(callGeminiSafe).not.toHaveBeenCalled();
    expect(result.summaryMarkdown).toBe(
      "No audio was detected in this meeting.",
    );
  });
});
