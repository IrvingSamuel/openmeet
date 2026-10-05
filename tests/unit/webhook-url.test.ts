import { describe, expect, it } from "vitest";
import {
  isDeliverableWebhookUrl,
  parseWebhookUrl,
} from "@/lib/webhook-url";

describe("parseWebhookUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(parseWebhookUrl("https://lms.example.com/hooks/openmeet")).toBe(
      "https://lms.example.com/hooks/openmeet",
    );
    expect(parseWebhookUrl("http://localhost:4000/hook")).toBe(
      "http://localhost:4000/hook",
    );
  });

  it("treats empty as null", () => {
    expect(parseWebhookUrl(null)).toBeNull();
    expect(parseWebhookUrl(undefined)).toBeNull();
    expect(parseWebhookUrl("")).toBeNull();
    expect(parseWebhookUrl("   ")).toBeNull();
  });

  it("rejects non-http schemes and relative paths", () => {
    expect(() => parseWebhookUrl("javascript:alert(1)")).toThrow(
      "webhook_url_invalid",
    );
    expect(() => parseWebhookUrl("data:text/plain,hi")).toThrow(
      "webhook_url_invalid",
    );
    expect(() => parseWebhookUrl("/relative")).toThrow("webhook_url_invalid");
  });

  it("rejects overly long URLs", () => {
    expect(() => parseWebhookUrl(`https://x.example/${"a".repeat(2000)}`)).toThrow(
      "webhook_url_too_long",
    );
  });
});

describe("isDeliverableWebhookUrl", () => {
  it("accepts http(s) only", () => {
    expect(isDeliverableWebhookUrl("https://hooks.example/meet")).toBe(true);
    expect(isDeliverableWebhookUrl("ftp://hooks.example/meet")).toBe(false);
    expect(isDeliverableWebhookUrl("not-a-url")).toBe(false);
  });
});
