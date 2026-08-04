/**
 * Allow only relative same-origin paths (e.g. /r/abc123).
 * Rejects protocol-relative, absolute URLs, and non-path values.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  if (value.includes("\\")) return null;
  return value;
}
