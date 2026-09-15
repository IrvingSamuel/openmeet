import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/app-settings";
import {
  DEFAULT_TAB_RETURN_MEDIA_PREFS,
  normalizeTabReturnEnabled,
  normalizeTabReturnMediaPolicy,
} from "@/lib/tab-return-media";

/** Public room prefs (no secrets) for in-call client behavior. */
export async function GET() {
  const row = await getAppSettings();
  return NextResponse.json({
    tabReturnMedia: {
      enabled: normalizeTabReturnEnabled(row?.tabReturnEnabled),
      mic: normalizeTabReturnMediaPolicy(
        row?.tabReturnMic ?? DEFAULT_TAB_RETURN_MEDIA_PREFS.mic,
      ),
      camera: normalizeTabReturnMediaPolicy(
        row?.tabReturnCamera ?? DEFAULT_TAB_RETURN_MEDIA_PREFS.camera,
      ),
    },
  });
}
