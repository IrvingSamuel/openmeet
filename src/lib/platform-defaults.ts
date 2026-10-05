import { resolveSystemUiTheme } from "@/lib/system-theme";

/** Default lobby subtitle derived from instance wordmark. */
export async function platformPoweredBySubtitle(): Promise<string> {
  const theme = await resolveSystemUiTheme();
  return `Powered by ${theme.wordmark}`;
}

export async function platformWordmark(): Promise<string> {
  const theme = await resolveSystemUiTheme();
  return theme.wordmark;
}
