/** Client-safe page-access types (no Node crypto). */

export const PAGE_ACCESS_IDS = ["home", "dashboard", "settings"] as const;

export type PageAccessId = (typeof PAGE_ACCESS_IDS)[number];

export type PageAccessRule = {
  /** When false, visitors need the request key cookie or are redirected. */
  enabled: boolean;
  /** Locale-relative path (e.g. /login) or absolute URL. */
  redirectTo: string;
};

export type PageAccessSettings = {
  /** Shared unlock key. Empty/null disables key unlock (redirect only). */
  requestKey: string | null;
  pages: Record<PageAccessId, PageAccessRule>;
};
