import { getAppSettings } from "@/lib/app-settings";
import {
  DEFAULT_SYSTEM_UI,
  systemUiToCssVars,
  type SystemUiTheme,
} from "@/lib/system-ui";

export type { SystemUiTheme };
export { DEFAULT_SYSTEM_UI, systemUiToCssVars };

/** Server-only: reads app_settings. Do not import from client components. */
export async function resolveSystemUiTheme(): Promise<SystemUiTheme> {
  const row = await getAppSettings();
  if (!row) return DEFAULT_SYSTEM_UI;
  return {
    primary: row.uiPrimary || DEFAULT_SYSTEM_UI.primary,
    secondary: row.uiSecondary || DEFAULT_SYSTEM_UI.secondary,
    tertiary: row.uiTertiary || DEFAULT_SYSTEM_UI.tertiary,
    background: row.uiBackground || DEFAULT_SYSTEM_UI.background,
    ink: row.uiInk || DEFAULT_SYSTEM_UI.ink,
    wordmark: row.uiWordmark || DEFAULT_SYSTEM_UI.wordmark,
    logoUrl: row.uiLogoUrl || null,
    faviconUrl: row.uiFaviconUrl || null,
    fontFamily: row.uiFontFamily || DEFAULT_SYSTEM_UI.fontFamily,
  };
}
