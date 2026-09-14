/** Policy applied to local mic/camera when the meeting tab becomes visible again. */
export const TAB_RETURN_MEDIA_POLICIES = ["open", "closed", "restore"] as const;

export type TabReturnMediaPolicy = (typeof TAB_RETURN_MEDIA_POLICIES)[number];

export const DEFAULT_TAB_RETURN_MEDIA_POLICY: TabReturnMediaPolicy = "closed";
export const DEFAULT_TAB_RETURN_ENABLED = true;

export function normalizeTabReturnMediaPolicy(
  raw: string | null | undefined,
): TabReturnMediaPolicy {
  const v = (raw || "").trim().toLowerCase();
  if (v === "open" || v === "closed" || v === "restore") return v;
  return DEFAULT_TAB_RETURN_MEDIA_POLICY;
}

/** Missing/null defaults to on so existing deployments keep privacy mute. */
export function normalizeTabReturnEnabled(
  raw: boolean | null | undefined,
): boolean {
  return raw !== false;
}

export type TabReturnMediaPrefs = {
  enabled: boolean;
  mic: TabReturnMediaPolicy;
  camera: TabReturnMediaPolicy;
};

export const DEFAULT_TAB_RETURN_MEDIA_PREFS: TabReturnMediaPrefs = {
  enabled: DEFAULT_TAB_RETURN_ENABLED,
  mic: DEFAULT_TAB_RETURN_MEDIA_POLICY,
  camera: DEFAULT_TAB_RETURN_MEDIA_POLICY,
};
