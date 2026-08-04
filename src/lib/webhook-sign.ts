import { createHmac } from "node:crypto";
import type { OutboundWebhookEvent } from "@/lib/webhook-payloads";

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

export function buildWebhookHeaders(opts: {
  event: OutboundWebhookEvent;
  body: string;
  secret?: string | null;
  timestamp?: string;
}): Record<string, string> {
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Chronos-Meet-Event": opts.event,
    "X-Chronos-Meet-Timestamp": timestamp,
    "User-Agent": "Chronos-Meet-Webhooks/1.0",
  };
  if (opts.secret?.trim()) {
    headers["X-Chronos-Meet-Signature"] = signWebhookPayload(
      opts.secret.trim(),
      timestamp,
      opts.body,
    );
  }
  return headers;
}
