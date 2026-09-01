/** Shared LLM helper used by summary + insights + chat (Gemini or OpenAI-compatible). */

import { resolveAiConfig, resolveOpenAiLlmConfig } from "@/lib/app-settings";

export class GeminiError extends Error {
  status: number;
  body: string;
  billingDepleted: boolean;

  constructor(status: number, body: string) {
    super(`Gemini error ${status}: ${body}`);
    this.name = "GeminiError";
    this.status = status;
    this.body = body;
    this.billingDepleted =
      status === 429 ||
      /RESOURCE_EXHAUSTED|credits? (are )?depleted|billing/i.test(body);
  }
}

export type GeminiResult = {
  text: string;
  offline: boolean;
  billingDepleted?: boolean;
  error?: string;
  model?: string;
  estInputTokens?: number;
  estOutputTokens?: number;
};

export type GeminiCallOpts = {
  /** Override model (default: GEMINI_MODEL / gemini-3.5-flash-lite). */
  model?: string;
  /** Cap completion length. */
  maxOutputTokens?: number;
};

/** Default model for high-volume calls (insights + chat). Env-only sync fallback for tests. */
export function defaultGeminiModel(): string {
  const openAi = resolveOpenAiLlmConfig();
  if (openAi.enabled) return openAi.model;
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
}

/** Model for post-meeting summaries. Env-only sync fallback for tests. */
export function summaryGeminiModel(): string {
  const openAi = resolveOpenAiLlmConfig();
  if (openAi.enabled) return openAi.summaryModel;
  return process.env.GEMINI_SUMMARY_MODEL || "gemini-3.5-flash";
}

/** Async model resolution (DB override → env → default). */
export async function resolveDefaultGeminiModel(): Promise<string> {
  const openAi = resolveOpenAiLlmConfig();
  if (openAi.enabled) return openAi.model;
  return (await resolveAiConfig()).geminiModel;
}

export async function resolveSummaryGeminiModel(): Promise<string> {
  const openAi = resolveOpenAiLlmConfig();
  if (openAi.enabled) return openAi.summaryModel;
  return (await resolveAiConfig()).geminiSummaryModel;
}

/** Rough token estimate (~4 chars/token for pt-BR prose). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function callGemini(prompt: string, opts?: GeminiCallOpts): Promise<string> {
  const result = await callGeminiSafe(prompt, opts);
  if (result.error && !result.offline) {
    throw new GeminiError(429, result.error);
  }
  return result.text;
}

async function callOpenAiCompatibleLlm(
  prompt: string,
  opts?: GeminiCallOpts,
): Promise<GeminiResult> {
  const cfg = resolveOpenAiLlmConfig();
  const model = opts?.model || cfg.model;
  const estInputTokens = estimateTokens(prompt);

  if (!cfg.apiKey) {
    return {
      text: [
        "## Resumo (modo offline)",
        "API key LLM não configurada.",
        "",
        prompt.slice(0, 800),
      ].join("\n"),
      offline: true,
      error: "AI_FALLBACK_API_KEY missing",
      model,
      estInputTokens,
      estOutputTokens: 0,
    };
  }

  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  try {
    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
    if (opts?.maxOutputTokens != null) {
      payload.max_tokens = opts.maxOutputTokens;
      payload.max_completion_tokens = opts.maxOutputTokens;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) {
      const billingDepleted =
        res.status === 429 ||
        /rate.?limit|quota|RESOURCE_EXHAUSTED|credits? (are )?depleted|billing/i.test(
          body,
        );
      return {
        text: "",
        offline: true,
        billingDepleted,
        error: `LLM error ${res.status}: ${body.slice(0, 500)}`,
        model,
        estInputTokens,
        estOutputTokens: 0,
      };
    }
    const json = JSON.parse(body) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning?: string;
        };
      }>;
    };
    const message = json.choices?.[0]?.message;
    const text = message?.content?.trim() || "";
    return {
      text,
      offline: false,
      model,
      estInputTokens,
      estOutputTokens: estimateTokens(text),
    };
  } catch (err) {
    return {
      text: "",
      offline: true,
      error: err instanceof Error ? err.message : String(err),
      model,
      estInputTokens,
      estOutputTokens: 0,
    };
  }
}

/** Non-throwing LLM call — returns offline/billing fallbacks instead of crashing. */
export async function callGeminiSafe(
  prompt: string,
  opts?: GeminiCallOpts,
): Promise<GeminiResult> {
  const openAi = resolveOpenAiLlmConfig();
  if (openAi.enabled) {
    return callOpenAiCompatibleLlm(prompt, opts);
  }

  const ai = await resolveAiConfig();
  const key = ai.geminiApiKey;
  const model = opts?.model || ai.geminiModel;
  const estInputTokens = estimateTokens(prompt);

  if (!key) {
    return {
      text: [
        "## Resumo (modo offline)",
        "GEMINI_API_KEY não configurada.",
        "",
        prompt.slice(0, 800),
      ].join("\n"),
      offline: true,
      error: "GEMINI_API_KEY missing",
      model,
      estInputTokens,
      estOutputTokens: 0,
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  try {
    const generationConfig: Record<string, number> = {};
    if (opts?.maxOutputTokens != null) {
      generationConfig.maxOutputTokens = opts.maxOutputTokens;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(Object.keys(generationConfig).length
          ? { generationConfig }
          : {}),
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      const billingDepleted =
        res.status === 429 ||
        /RESOURCE_EXHAUSTED|credits? (are )?depleted|quota|billing/i.test(body);
      return {
        text: "",
        offline: true,
        billingDepleted,
        error: `Gemini error ${res.status}: ${body.slice(0, 500)}`,
        model,
        estInputTokens,
        estOutputTokens: 0,
      };
    }
    const json = JSON.parse(body) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>;
        };
      }>;
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text!)
      .join("");
    return {
      text,
      offline: false,
      model,
      estInputTokens,
      estOutputTokens: estimateTokens(text),
    };
  } catch (err) {
    return {
      text: "",
      offline: true,
      error: err instanceof Error ? err.message : String(err),
      model,
      estInputTokens,
      estOutputTokens: 0,
    };
  }
}

export function offlineSummaryMarkdown(
  transcript: string,
  reason: string,
  opts?: { billingDepleted?: boolean },
): string {
  const openAi = resolveOpenAiLlmConfig();
  const hint = opts?.billingDepleted
    ? "O limite de utilização da API foi atingido. Aguarde alguns minutos e volte a gerar o resumo."
    : openAi.enabled
      ? "Verifique `AI_FALLBACK_API_KEY` / `AI_FALLBACK_MODEL` no servidor e volte a gerar o resumo."
      : "Verifique `GEMINI_API_KEY` / `GEMINI_MODEL` no servidor e volte a gerar o resumo.";
  return [
    "## Principais pontos",
    "",
    `> O resumo automático não pôde ser gerado: ${reason}`,
    "",
    hint,
    "",
    "## Insights gerados",
    "",
    "_Indisponível (LLM offline)._",
    "",
    "## Observações e anotações",
    "",
    "_Indisponível (LLM offline)._",
    "",
    "## Sugestões de tarefas",
    "",
    "_Indisponível — edite tarefas manualmente abaixo se necessário._",
    "",
    "## Transcrição bruta",
    "",
    transcript.trim()
      ? "```\n" + transcript.slice(0, 12000) + "\n```"
      : "_(sem segmentos transcritos)_",
  ].join("\n");
}

/** Extract a JSON object/array from a fenced block or raw model output. */
export function extractJsonBlock<T>(
  raw: string,
  tag?: string,
): { rest: string; data: T | null } {
  if (tag) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
    const match = raw.match(re);
    if (match) {
      try {
        return {
          rest: raw.replace(match[0], "").trim(),
          data: JSON.parse(match[1].trim()) as T,
        };
      } catch {
        return { rest: raw.replace(match[0], "").trim(), data: null };
      }
    }
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return {
        rest: raw.replace(fence[0], "").trim(),
        data: JSON.parse(fence[1].trim()) as T,
      };
    } catch {
      /* fall through */
    }
  }
  try {
    return { rest: raw, data: JSON.parse(raw.trim()) as T };
  } catch {
    return { rest: raw, data: null };
  }
}
