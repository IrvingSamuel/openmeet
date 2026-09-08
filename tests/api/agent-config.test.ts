// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveAiConfig = vi.fn();

vi.mock("@/lib/app-settings", () => ({
  resolveAiConfig: (...args: unknown[]) => resolveAiConfig(...args),
}));

import { GET as getAgentConfig } from "@/app/api/agent/config/route";

beforeEach(() => {
  resolveAiConfig.mockReset();
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
});
