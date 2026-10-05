/** Validate absolute http(s) URL used as an outbound webhook destination. */
export function parseWebhookUrl(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) {
    throw new Error("webhook_url_too_long");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("webhook_url_invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("webhook_url_invalid");
  }
  return url.toString();
}

export function isDeliverableWebhookUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
