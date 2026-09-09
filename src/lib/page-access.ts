import { createHmac, timingSafeEqual } from "crypto";
import {
  PAGE_ACCESS_IDS,
  type PageAccessId,
  type PageAccessRule,
  type PageAccessSettings,
} from "@/lib/page-access-types";

export {
  PAGE_ACCESS_IDS,
  type PageAccessId,
  type PageAccessRule,
  type PageAccessSettings,
} from "@/lib/page-access-types";

export const PAGE_ACCESS_COOKIE = "om_page_access";

export const DEFAULT_PAGE_ACCESS: PageAccessSettings = {
  requestKey: null,
  pages: {
    home: { enabled: true, redirectTo: "/login" },
    dashboard: { enabled: true, redirectTo: "/login" },
    settings: { enabled: true, redirectTo: "/login" },
  },
};

export function defaultPageRule(
  id: PageAccessId,
  partial?: Partial<PageAccessRule>,
): PageAccessRule {
  const base = DEFAULT_PAGE_ACCESS.pages[id];
  return {
    enabled: partial?.enabled ?? base.enabled,
    redirectTo: (partial?.redirectTo ?? base.redirectTo).trim() || base.redirectTo,
  };
}

export function normalizePageAccessSettings(
  raw: unknown,
): PageAccessSettings {
  if (!raw || typeof raw !== "object") {
    return structuredClone(DEFAULT_PAGE_ACCESS);
  }
  const obj = raw as Record<string, unknown>;
  const pagesRaw =
    obj.pages && typeof obj.pages === "object"
      ? (obj.pages as Record<string, unknown>)
      : {};
  const pages = {} as PageAccessSettings["pages"];
  for (const id of PAGE_ACCESS_IDS) {
    const p = pagesRaw[id];
    if (p && typeof p === "object") {
      const row = p as Record<string, unknown>;
      pages[id] = defaultPageRule(id, {
        enabled: row.enabled !== false,
        redirectTo:
          typeof row.redirectTo === "string" ? row.redirectTo : undefined,
      });
    } else {
      pages[id] = defaultPageRule(id);
    }
  }
  const key =
    typeof obj.requestKey === "string" ? obj.requestKey.trim() : "";
  return {
    requestKey: key || null,
    pages,
  };
}

function signingSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.AGENT_SHARED_SECRET?.trim() ||
    "openmeet-page-access-dev"
  );
}

export function pageAccessCookieValue(requestKey: string): string {
  return createHmac("sha256", signingSecret())
    .update(`page-access:${requestKey}`)
    .digest("hex");
}

export function verifyPageAccessCookie(
  cookieValue: string | undefined,
  requestKey: string | null | undefined,
): boolean {
  if (!cookieValue || !requestKey?.trim()) return false;
  const expected = pageAccessCookieValue(requestKey.trim());
  try {
    const a = Buffer.from(cookieValue, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function keysMatch(provided: string, expected: string | null): boolean {
  if (!expected?.trim()) return false;
  const a = Buffer.from(provided.trim(), "utf8");
  const b = Buffer.from(expected.trim(), "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Build a locale-prefixed internal path, or pass through absolute URLs. */
export function resolveAccessRedirect(
  redirectTo: string,
  locale: string,
): string {
  const raw = redirectTo.trim() || "/login";
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return path;
  return `/${locale}${path === "/" ? "" : path}`;
}
