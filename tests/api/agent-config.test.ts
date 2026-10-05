// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveAiConfig = vi.fn();
const meetingsFindFirst = vi.fn();

vi.mock("@/lib/app-settings", () => ({
  resolveAiConfig: (...args: unknown[]) => resolveAiConfig(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
    },
  },
}));

import { GET as getAgentConfig } from "@/app/api/agent/config/route";

const AI_CONFIG = {
  geminiApiKey: undefined,
  geminiModel: "m",
  geminiSummaryModel: "m",
  deepgramApiKey: "dg",
  sources: {
    geminiApiKey: "none",
    geminiModel: "default",
    geminiSummaryModel: "default",
    deepgramApiKey: "db",
  },
};

beforeEach(() => {
  resolveAiConfig.mockReset();
  meetingsFindFirst.mockReset();
  delete process.env.AGENT_SHARED_SECRET;
});

describe("GET /api/agent/config", () => {
  it("returns resolved deepgram key from DB/env", async () => {
    resolveAiConfig.mockResolvedValue({
      geminiApiKey: undefined,
      geminiModel: "m",
      geminiSummaryModel: "m",
      deepgramApiKey: "dg-from-db",
      sources: {
        geminiApiKey: "none",
        geminiModel: "default",
        geminiSummaryModel: "default",
        deepgramApiKey: "db",
      },
    });

    const res = await getAgentConfig(
      new NextRequest("http://localhost/api/agent/config"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deepgramApiKey).toBe("dg-from-db");
    expect(body.deepgramSource).toBe("db");
  });

  it("rejects invalid agent secret when configured", async () => {
    process.env.AGENT_SHARED_SECRET = "secret";
    const res = await getAgentConfig(
      new NextRequest("http://localhost/api/agent/config", {
        headers: { "x-agent-secret": "wrong" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts matching agent secret", async () => {
    process.env.AGENT_SHARED_SECRET = "secret";
    resolveAiConfig.mockResolvedValue({
      geminiApiKey: undefined,
      geminiModel: "m",
      geminiSummaryModel: "m",
      deepgramApiKey: "dg-env",
      sources: {
        geminiApiKey: "none",
        geminiModel: "default",
        geminiSummaryModel: "default",
        deepgramApiKey: "env",
      },
    });

    const res = await getAgentConfig(
      new NextRequest("http://localhost/api/agent/config", {
        headers: { "x-agent-secret": "secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deepgramSource).toBe("env");
    expect(body.deepgramApiKey).toBe("dg-env");
  });

  it("keeps the legacy shape without ?room=", async () => {
    resolveAiConfig.mockResolvedValue(AI_CONFIG);
    const res = await getAgentConfig(
      new NextRequest("http://localhost/api/agent/config"),
    );
    const body = await res.json();
    expect(body).toEqual({ deepgramApiKey: "dg", deepgramSource: "db" });
    expect(meetingsFindFirst).not.toHaveBeenCalled();
  });

  it("returns meetingId and features for ?room=", async () => {
    resolveAiConfig.mockResolvedValue(AI_CONFIG);
    meetingsFindFirst.mockResolvedValue({
      id: "m1",
      captionsEnabled: false,
      transcriptionEnabled: true,
      summaryEnabled: false,
    });
    const res = await getAgentConfig(
      new NextRequest("http://localhost/api/agent/config?room=meet_abc"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetingId).toBe("m1");
    expect(body.features).toEqual({
      captions: false,
      transcription: true,
      summary: false,
    });
    expect(body.deepgramApiKey).toBe("dg");
  });

  it("defaults features on for an unknown room", async () => {
    resolveAiConfig.mockResolvedValue(AI_CONFIG);
    meetingsFindFirst.mockResolvedValue(undefined);
    const res = await getAgentConfig(
      new NextRequest("http://localhost/api/agent/config?room=meet_ghost"),
    );
    const body = await res.json();
    expect(body.meetingId).toBeNull();
    expect(body.features).toEqual({
      captions: true,
      transcription: true,
      summary: true,
    });
  });
});
