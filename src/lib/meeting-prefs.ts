import type { MediaPrefs } from "@/lib/media-prefs-schema";
import {
  DEFAULT_TAB_RETURN_MEDIA_PREFS,
  normalizeTabReturnEnabled,
  normalizeTabReturnMediaPolicy,
  type TabReturnMediaPrefs,
} from "@/lib/tab-return-media";

export type PlatformMeetingPrefs = {
  captionsDefault?: boolean | null;
  tabReturnMedia?: {
    enabled?: boolean | null;
    mic?: string | null;
    camera?: string | null;
  } | null;
};

type UserMeetingPrefs = Pick<
  MediaPrefs,
  "captionsDefault" | "tabReturnEnabled" | "tabReturnMic" | "tabReturnCamera"
>;

export function resolveCaptionsDefault({
  user,
  platform,
}: {
  user?: Partial<UserMeetingPrefs> | null;
  platform?: PlatformMeetingPrefs | null;
}): boolean {
  if (typeof user?.captionsDefault === "boolean") return user.captionsDefault;
  if (typeof platform?.captionsDefault === "boolean") {
    return platform.captionsDefault;
  }
  return true;
}

export function resolveTabReturnPrefs({
  user,
  platform,
}: {
  user?: Partial<UserMeetingPrefs> | null;
  platform?: PlatformMeetingPrefs | null;
}): TabReturnMediaPrefs {
  const platformPrefs = platform?.tabReturnMedia;
  const base: TabReturnMediaPrefs = platformPrefs
    ? {
        enabled: normalizeTabReturnEnabled(platformPrefs.enabled),
        mic: normalizeTabReturnMediaPolicy(platformPrefs.mic),
        camera: normalizeTabReturnMediaPolicy(platformPrefs.camera),
      }
    : DEFAULT_TAB_RETURN_MEDIA_PREFS;

  return {
    enabled:
      typeof user?.tabReturnEnabled === "boolean"
        ? user.tabReturnEnabled
        : base.enabled,
    mic: user?.tabReturnMic ?? base.mic,
    camera: user?.tabReturnCamera ?? base.camera,
  };
}
