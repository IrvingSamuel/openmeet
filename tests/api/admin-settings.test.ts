// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
  email: undefined as string | undefined,
};

const ensureAppSettings = vi.fn();
const resolveAiConfig = vi.fn();
const invalidateAppSettingsCache = vi.fn();
const updateReturning = vi.fn();
const sendTestWebhook = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/app-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/app-settings")>(
    "@/lib/app-settings",
  );
  return {
    ...actual,
    ensureAppSettings: (...args: unknown[]) => ensureAppSettings(...args),
    resolveAiConfig: (...args: unknown[]) => resolveAiConfig(...args),
    invalidateAppSettingsCache: (...args: unknown[]) =>
      invalidateAppSettingsCache(...args),
  };
});

vi.mock("@/lib/outbound-webhooks", async () => {
  const payloads = await import("@/lib/webhook-payloads");
  return {
    exampleWebhookPayload: payloads.exampleWebhookPayload,
    sendTestWebhook: (...args: unknown[]) => sendTestWebhook(...args),
  };
});

vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => updateReturning(),
        }),
      }),
    }),
  },
}));

import { GET, PUT } from "@/app/api/admin/settings/route";
import { POST as testWebhook } from "@/app/api/admin/webhooks/test/route";

function jsonRequest(body: unknown, method = "PUT") {
  return new Request("http://localhost/api/admin/settings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const baseRow = {
  id: "00000000-0000-0000-0000-000000000001",
  locale: "pt-BR",
  geminiApiKey: null,
  geminiModel: null,
  geminiSummaryModel: null,
  deepgramApiKey: null,
  webhookUrl: "https://hooks.example/meet",
  webhookSecret: null,
  webhookEnabled: true,
  webhookEvents: {
    transcript: true,
    chat: true,
    summary: true,
    tasks: true,
  },
  updatedAt: new Date("2026-08-04T12:00:00.000Z"),
};

const baseAi = {
  geminiApiKey: "env-key-1234",
  geminiModel: "gemini-3.5-flash-lite",
  geminiSummaryModel: "gemini-3.5-flash-lite",
  deepgramApiKey: undefined,
  sources: {
    geminiApiKey: "env" as const,
    geminiModel: "default" as const,
    geminiSummaryModel: "default" as const,
    deepgramApiKey: "none" as const,
  },
};

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  session.email = undefined;
  process.env.ADMIN_EMAILS = "admin@chronos.com.pt";
  ensureAppSettings.mockReset();
  resolveAiConfig.mockReset();
  invalidateAppSettingsCache.mockReset();
  updateReturning.mockReset();
  sendTestWebhook.mockReset();
  ensureAppSettings.mockResolvedValue(baseRow);
  resolveAiConfig.mockResolvedValue(baseAi);
  updateReturning.mockResolvedValue([
    { ...baseRow, locale: "en", updatedAt: new Date() },
  ]);
});

describe("GET /api/admin/settings", () => {
  it("rejects anonymous", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("rejects non-admin", async () => {
    session.isLoggedIn = true;
    session.email = "user@example.com";
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns masked settings for admin", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.locale).toBe("pt-BR");
    expect(json.geminiApiKey.configured).toBe(true);
    expect(json.geminiApiKey.preview).toBe("••••1234");
    expect(json.webhookUrl).toBe("https://hooks.example/meet");
  });
});

describe("PUT /api/admin/settings", () => {
  it("rejects non-admin", async () => {
    session.isLoggedIn = true;
    session.email = "user@example.com";
    const res = await PUT(jsonRequest({ locale: "en" }));
    expect(res.status).toBe(403);
  });

  it("updates locale for admin", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    const res = await PUT(jsonRequest({ locale: "en" }));
    expect(res.status).toBe(200);
    expect(invalidateAppSettingsCache).toHaveBeenCalled();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.locale).toBe("en");
  });
});

describe("POST /api/admin/webhooks/test", () => {
  it("rejects non-admin", async () => {
    session.isLoggedIn = true;
    session.email = "user@example.com";
    const res = await testWebhook(
      jsonRequest({ event: "summary.ready" }, "POST"),
    );
    expect(res.status).toBe(403);
  });

  it("returns dry-run example without delivery", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    const res = await testWebhook(
      jsonRequest({ event: "summary.ready", dryRun: true }, "POST"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.example.event).toBe("summary.ready");
    expect(sendTestWebhook).not.toHaveBeenCalled();
  });

  it("delivers test webhook for admin", async () => {
    session.isLoggedIn = true;
    session.email = "admin@chronos.com.pt";
    sendTestWebhook.mockResolvedValue({ ok: true, status: 200 });
    const res = await testWebhook(
      jsonRequest({ event: "transcript.ready" }, "POST"),
    );
    expect(res.status).toBe(200);
    expect(sendTestWebhook).toHaveBeenCalledWith("transcript.ready");
  });
});
