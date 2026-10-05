import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAppSettings } from "@/lib/app-settings";
import {
  DEFAULT_PAGE_ACCESS,
  normalizePageAccessSettings,
  PAGE_ACCESS_COOKIE,
  resolveAccessRedirect,
  verifyPageAccessCookie,
  type PageAccessId,
  type PageAccessSettings,
} from "@/lib/page-access";

export async function getPageAccessSettings(): Promise<PageAccessSettings> {
  const row = await getAppSettings();
  return normalizePageAccessSettings(row?.pageAccess ?? DEFAULT_PAGE_ACCESS);
}

/**
 * Server-side gate for marketing/app shell pages.
 * Admins are not exempt here — use request key or enable the page.
 * Meeting routes (/m, /r), login, admin, setup are never gated.
 */
export async function enforcePageAccess(
  pageId: PageAccessId,
  locale: string,
): Promise<void> {
  const settings = await getPageAccessSettings();
  const rule = settings.pages[pageId];
  if (rule.enabled) return;

  const jar = await cookies();
  const unlocked = verifyPageAccessCookie(
    jar.get(PAGE_ACCESS_COOKIE)?.value,
    settings.requestKey,
  );
  if (unlocked) return;

  redirect(resolveAccessRedirect(rule.redirectTo, locale));
}
