// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveAiConfig = vi.fn();

vi.mock("@/lib/app-settings", () => ({
  resolveOpenAiLlmConfig: () => {
    const enabled = process.env.AI_FALLBACK_ENABLED?.trim() === "true";
    const model =
      process.env.AI_FALLBACK_MODEL?.trim() || "openai/gpt-oss-120b";
    const summaryModel =
      process.env.AI_FALLBACK_SUMMARY_MODEL?.trim() || model;
    return {
      enabled,
      baseUrl:
        process.env.AI_FALLBACK_BASE_URL?.trim() ||
        "https://api.groq.com/openai/v1",
      apiKey: process.env.AI_FALLBACK_API_KEY?.trim() || undefined,
      model,
      summaryModel,
    };
  },
  resolveAiConfig: (...args: unknown[]) => resolveAiConfig(...args),
}));

import { callGeminiSafe } from "@/lib/gemini";

const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (!(key in envBackup)) {
    envBackup[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("callGeminiSafe with AI_FALLBACK_ENABLED", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resolveAiConfig.mockReset();
    resolveAiConfig.mockResolvedValue({
      geminiApiKey: "gemini-key",
      geminiModel: "gemini-3.5-flash-lite",
      geminiSummaryModel: "gemini-3.5-flash",
      deepgramApiKey: "dg-key",
      sources: {
        geminiApiKey: "env",
        geminiModel: "default",
        geminiSummaryModel: "default",
        deepgramApiKey: "env",
      },
    });
    setEnv("AI_FALLBACK_ENABLED", "true");
    setEnv("AI_FALLBACK_BASE_URL", "https://api.groq.com/openai/v1");
    setEnv("AI_FALLBACK_API_KEY", "gsk-test-key");
    setEnv("AI_FALLBACK_MODEL", "openai/gpt-oss-120b");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it("routes to OpenAI-compatible /chat/completions instead of Gemini", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "Resposta do Groq" } }],
        }),
    });

    const result = await callGeminiSafe("Olá");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer gsk-test-key",
    });
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.messages[0].content).toBe("Olá");
    expect(result.text).toBe("Resposta do Groq");
    expect(result.offline).toBe(false);
    expect(result.model).toBe("openai/gpt-oss-120b");
  });

  it("returns offline when API key is missing", async () => {
    setEnv("AI_FALLBACK_API_KEY", undefined);

    const result = await callGeminiSafe("teste");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.offline).toBe(true);
    expect(result.error).toBe("AI_FALLBACK_API_KEY missing");
  });

  it("marks billingDepleted on 429", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limit exceeded",
    });

    const result = await callGeminiSafe("teste");

    expect(result.offline).toBe(true);
    expect(result.billingDepleted).toBe(true);
    expect(result.error).toContain("429");
  });

  it("respects maxOutputTokens in the request body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
        }),
    });

    await callGeminiSafe("prompt", { maxOutputTokens: 1024 });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { max_tokens: number; max_completion_tokens: number };
    expect(body.max_tokens).toBe(1024);
    expect(body.max_completion_tokens).toBe(1024);
  });

  it("uses Gemini when AI_FALLBACK_ENABLED is false", async () => {
    setEnv("AI_FALLBACK_ENABLED", "false");
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Gemini reply" }] } },
          ],
        }),
    });

    const result = await callGeminiSafe("Olá");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(result.text).toBe("Gemini reply");
  });
});
