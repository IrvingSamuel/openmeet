/** Policy applied to local mic/camera when the meeting tab becomes visible again. */
export const TAB_RETURN_MEDIA_POLICIES = ["open", "closed", "restore"] as const;

export type TabReturnMediaPolicy = (typeof TAB_RETURN_MEDIA_POLICIES)[number];

export const DEFAULT_TAB_RETURN_MEDIA_POLICY: TabReturnMediaPolicy = "closed";

export function normalizeTabReturnMediaPolicy(
  raw: string | null | undefined,
): TabReturnMediaPolicy {
  const v = (raw || "").trim().toLowerCase();
  if (v === "open" || v === "closed" || v === "restore") return v;
  return DEFAULT_TAB_RETURN_MEDIA_POLICY;
}

export type TabReturnMediaPrefs = {
  mic: TabReturnMediaPolicy;
  camera: TabReturnMediaPolicy;
};

export const DEFAULT_TAB_RETURN_MEDIA_PREFS: TabReturnMediaPrefs = {
  mic: DEFAULT_TAB_RETURN_MEDIA_POLICY,
  camera: DEFAULT_TAB_RETURN_MEDIA_POLICY,
};
