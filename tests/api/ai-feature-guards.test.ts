// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const meetingsFindFirst = vi.fn();
const participantsFindFirst = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();
const callGeminiSafe = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ isLoggedIn: false }),
}));

vi.mock("@/lib/gemini", () => ({
  callGeminiSafe: (...args: unknown[]) => callGeminiSafe(...args),
  extractJsonBlock: vi.fn(),
  offlineSummaryMarkdown: vi.fn(),
  resolveSummaryGeminiModel: vi.fn(async () => "gemini-test"),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
      participants: {
        findFirst: (...args: unknown[]) => participantsFindFirst(...args),
      },
    },
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v);
        return { returning: () => Promise.resolve([{ id: "seg-1" }]) };
      },
    }),
    update: () => ({
      set: (patch: unknown) => {
        updateSet(patch);
        return {
          where: () => ({ returning: () => Promise.resolve([{ id: "m1" }]) }),
        };
      },
    }),
  },
}));

import { POST as postTranscript } from "@/app/api/transcripts/route";
import { POST as postSummary } from "@/app/api/meetings/summary/route";

const meetingId = "11111111-1111-4111-8111-111111111111";

function agentRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agent-secret": "s3cret" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  meetingsFindFirst.mockReset();
  participantsFindFirst.mockReset();
  insertValues.mockReset();
  updateSet.mockReset();
  callGeminiSafe.mockReset();
  participantsFindFirst.mockResolvedValue(undefined);
  process.env.AGENT_SHARED_SECRET = "s3cret";
});

describe("POST /api/transcripts with AI features", () => {
  const segment = { meetingId, speakerLabel: "Ana", text: "Olá" };

  it("ignores segments when the meeting has transcription off", async () => {
    meetingsFindFirst.mockResolvedValue({ id: meetingId, transcriptionEnabled: false });
    const res = await postTranscript(
      agentRequest("http://localhost/api/transcripts", segment),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ skipped: true });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("saves segments when transcription is on", async () => {
    meetingsFindFirst.mockResolvedValue({ id: meetingId, transcriptionEnabled: true });
    const res = await postTranscript(
      agentRequest("http://localhost/api/transcripts", segment),
    );
    expect(res.status).toBe(201);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId, text: "Olá" }),
    );
  });
});

describe("POST /api/meetings/summary with the summary off", () => {
  it.each([false, true])("responds disabled (force=%s) without generating", async (force) => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      summaryEnabled: false,
      summaryStatus: "disabled",
    });
    const res = await postSummary(
      agentRequest("http://localhost/api/meetings/summary", { meetingId, force }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("disabled");
    expect(updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ summaryStatus: "running" }),
    );
    expect(callGeminiSafe).not.toHaveBeenCalled();
  });

  it("treats legacy transcription-off rows as summary off", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      transcriptionEnabled: false,
      summaryEnabled: true,
      summaryStatus: "pending",
    });
    const res = await postSummary(
      agentRequest("http://localhost/api/meetings/summary", { meetingId }),
    );
    expect((await res.json()).status).toBe("disabled");
    expect(callGeminiSafe).not.toHaveBeenCalled();
  });
});
