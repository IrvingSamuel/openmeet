import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      appSettings: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { isAdmin, parseAdminEmails } from "@/lib/admin-auth";
import {
  localePromptLabel,
  maskSecret,
  shouldSkipSecretUpdate,
  webhookEventsOrDefault,
} from "@/lib/app-settings";
import {
  buildWebhookHeaders,
  signWebhookPayload,
} from "@/lib/webhook-sign";
import {
  exampleWebhookPayload,
  OUTBOUND_WEBHOOK_EVENTS,
} from "@/lib/webhook-payloads";

describe("parseAdminEmails / isAdmin", () => {
  it("parses comma-separated emails case-insensitively", () => {
    expect([...parseAdminEmails("a@x.com, B@Y.COM ,")]).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("returns empty set for blank env", () => {
    expect(parseAdminEmails("").size).toBe(0);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });

  it("grants admin only to listed logged-in emails", () => {
    const env = "owner@chronos.com.pt, ops@example.com";
    expect(
      isAdmin({ isLoggedIn: true, email: "Owner@Chronos.com.pt" }, env),
    ).toBe(true);
    expect(
      isAdmin({ isLoggedIn: true, email: "user@example.com" }, env),
    ).toBe(false);
    expect(
      isAdmin({ isLoggedIn: false, email: "owner@chronos.com.pt" }, env),
    ).toBe(false);
    expect(isAdmin({ isLoggedIn: true, email: undefined }, env)).toBe(false);
  });
});

describe("secret helpers", () => {
  it("masks secrets with last4", () => {
    expect(maskSecret("sk-abcdefgh")).toEqual({
      configured: true,
      preview: "••••efgh",
      source: "db",
    });
    expect(maskSecret("")).toEqual({
      configured: false,
      preview: null,
      source: "none",
    });
  });

  it("skips masked or empty secret updates", () => {
    expect(shouldSkipSecretUpdate("••••abcd")).toBe(true);
    expect(shouldSkipSecretUpdate("")).toBe(true);
    expect(shouldSkipSecretUpdate(null)).toBe(true);
    expect(shouldSkipSecretUpdate("real-secret")).toBe(false);
  });
});

describe("webhookEventsOrDefault", () => {
  it("fills missing toggles", () => {
    expect(webhookEventsOrDefault(null)).toEqual({
      transcript: true,
      chat: true,
      summary: true,
      tasks: true,
      recording: true,
    });
    expect(webhookEventsOrDefault({ transcript: false } as never)).toEqual({
      transcript: false,
      chat: true,
      summary: true,
      tasks: true,
      recording: true,
    });
  });
});

describe("localePromptLabel", () => {
  it("maps known locales", () => {
    expect(localePromptLabel("pt-BR")).toContain("português");
    expect(localePromptLabel("en")).toBe("English");
  });
});

describe("HMAC webhook signing", () => {
  it("signs timestamp.body with sha256", () => {
    const body = JSON.stringify({ ok: true });
    const timestamp = "1722771000";
    const sig = signWebhookPayload("secret", timestamp, body);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(
      buildWebhookHeaders({
        event: "summary.ready",
        body,
        secret: "secret",
        timestamp,
      })["X-Chronos-Meet-Signature"],
    ).toBe(sig);
  });

  it("omits signature when secret missing", () => {
    const headers = buildWebhookHeaders({
      event: "chat.ready",
      body: "{}",
    });
    expect(headers["X-Chronos-Meet-Event"]).toBe("chat.ready");
    expect(headers["X-Chronos-Meet-Signature"]).toBeUndefined();
  });
});

describe("exampleWebhookPayload", () => {
  it("builds a versioned envelope for every event", () => {
    for (const event of OUTBOUND_WEBHOOK_EVENTS) {
      const payload = exampleWebhookPayload(event);
      expect(payload.event).toBe(event);
      expect(payload.version).toBe(1);
      expect(payload.meeting.roomSlug).toBe("standup");
      expect(payload.data).toBeTruthy();
    }
  });
});

// silence unused — beforeAll keeps vi.mock hoist order stable in some runners
beforeAll(() => undefined);
