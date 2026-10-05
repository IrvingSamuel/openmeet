import { z } from "zod";

/** Absolute http(s) URL or site-relative path (e.g. /virtual-backgrounds/…, /brand-assets/…). */
export const mediaAssetUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (v) =>
      v === "" ||
      v.startsWith("/") ||
      /^https?:\/\//i.test(v),
    { message: "invalid_url" },
  )
  .nullable()
  .optional();

export const videoEffectSchema = z.enum(["none", "blur", "virtual"]);
export const tabReturnPolicySchema = z.enum(["open", "closed", "restore"]);

export const mediaPrefsFieldsSchema = z.object({
  videoEffect: videoEffectSchema.optional(),
  blurRadius: z.number().int().min(4).max(24).optional(),
  virtualBackgroundUrl: mediaAssetUrlSchema,
  noiseSuppression: z.boolean().optional(),
  echoCancellation: z.boolean().optional(),
  autoGainControl: z.boolean().optional(),
  captionsDefault: z.boolean().nullable().optional(),
  tabReturnEnabled: z.boolean().nullable().optional(),
  tabReturnMic: tabReturnPolicySchema.nullable().optional(),
  tabReturnCamera: tabReturnPolicySchema.nullable().optional(),
});

export type MediaPrefsFieldsInput = z.infer<typeof mediaPrefsFieldsSchema>;

export type MediaPrefs = {
  videoEffect: "none" | "blur" | "virtual";
  blurRadius: number;
  virtualBackgroundUrl: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  captionsDefault: boolean | null;
  tabReturnEnabled: boolean | null;
  tabReturnMic: "open" | "closed" | "restore" | null;
  tabReturnCamera: "open" | "closed" | "restore" | null;
};

export const DEFAULT_MEDIA_PREFS: MediaPrefs = {
  videoEffect: "none",
  blurRadius: 10,
  virtualBackgroundUrl: null,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  captionsDefault: null,
  tabReturnEnabled: null,
  tabReturnMic: null,
  tabReturnCamera: null,
};

export const MEDIA_PREFS_STORAGE_KEY = "openmeet:media-prefs";

export const VIRTUAL_BACKGROUND_PRESETS = [
  {
    id: "office",
    url: "/virtual-backgrounds/office.jpg",
    labelKey: "presetOffice",
  },
  {
    id: "living",
    url: "/virtual-backgrounds/living.jpg",
    labelKey: "presetLiving",
  },
  {
    id: "bookshelf",
    url: "/virtual-backgrounds/bookshelf.jpg",
    labelKey: "presetBookshelf",
  },
  {
    id: "gradient",
    url: "/virtual-backgrounds/gradient.jpg",
    labelKey: "presetGradient",
  },
  {
    id: "nature",
    url: "/virtual-backgrounds/nature.jpg",
    labelKey: "presetNature",
  },
  {
    id: "abstract",
    url: "/virtual-backgrounds/abstract.jpg",
    labelKey: "presetAbstract",
  },
] as const;

export function normalizeMediaAssetUrl(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value;
}

export function mediaPrefsFieldsToPatch(
  data: MediaPrefsFieldsInput,
): Partial<MediaPrefs> {
  const patch: Partial<MediaPrefs> = {};
  if (data.videoEffect !== undefined) patch.videoEffect = data.videoEffect;
  if (data.blurRadius !== undefined) patch.blurRadius = data.blurRadius;
  if (data.virtualBackgroundUrl !== undefined) {
    patch.virtualBackgroundUrl =
      normalizeMediaAssetUrl(data.virtualBackgroundUrl) ?? null;
  }
  if (data.noiseSuppression !== undefined) {
    patch.noiseSuppression = data.noiseSuppression;
  }
  if (data.echoCancellation !== undefined) {
    patch.echoCancellation = data.echoCancellation;
  }
  if (data.autoGainControl !== undefined) {
    patch.autoGainControl = data.autoGainControl;
  }
  if (data.captionsDefault !== undefined) {
    patch.captionsDefault = data.captionsDefault;
  }
  if (data.tabReturnEnabled !== undefined) {
    patch.tabReturnEnabled = data.tabReturnEnabled;
  }
  if (data.tabReturnMic !== undefined) patch.tabReturnMic = data.tabReturnMic;
  if (data.tabReturnCamera !== undefined) {
    patch.tabReturnCamera = data.tabReturnCamera;
  }
  return patch;
}

export function coerceMediaPrefs(raw: unknown): MediaPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEDIA_PREFS };
  const o = raw as Record<string, unknown>;
  const videoEffect =
    o.videoEffect === "blur" || o.videoEffect === "virtual" || o.videoEffect === "none"
      ? o.videoEffect
      : DEFAULT_MEDIA_PREFS.videoEffect;
  const blurRadius =
    typeof o.blurRadius === "number" &&
    Number.isFinite(o.blurRadius) &&
    o.blurRadius >= 4 &&
    o.blurRadius <= 24
      ? Math.round(o.blurRadius)
      : DEFAULT_MEDIA_PREFS.blurRadius;
  let virtualBackgroundUrl: string | null = DEFAULT_MEDIA_PREFS.virtualBackgroundUrl;
  if (typeof o.virtualBackgroundUrl === "string" && o.virtualBackgroundUrl) {
    virtualBackgroundUrl = o.virtualBackgroundUrl;
  } else if (o.virtualBackgroundUrl === null) {
    virtualBackgroundUrl = null;
  }
  return {
    videoEffect,
    blurRadius,
    virtualBackgroundUrl,
    noiseSuppression:
      typeof o.noiseSuppression === "boolean"
        ? o.noiseSuppression
        : DEFAULT_MEDIA_PREFS.noiseSuppression,
    echoCancellation:
      typeof o.echoCancellation === "boolean"
        ? o.echoCancellation
        : DEFAULT_MEDIA_PREFS.echoCancellation,
    autoGainControl:
      typeof o.autoGainControl === "boolean"
        ? o.autoGainControl
        : DEFAULT_MEDIA_PREFS.autoGainControl,
    captionsDefault:
      typeof o.captionsDefault === "boolean" ? o.captionsDefault : null,
    tabReturnEnabled:
      typeof o.tabReturnEnabled === "boolean" ? o.tabReturnEnabled : null,
    tabReturnMic:
      o.tabReturnMic === "open" ||
      o.tabReturnMic === "closed" ||
      o.tabReturnMic === "restore"
        ? o.tabReturnMic
        : null,
    tabReturnCamera:
      o.tabReturnCamera === "open" ||
      o.tabReturnCamera === "closed" ||
      o.tabReturnCamera === "restore"
        ? o.tabReturnCamera
        : null,
  };
}

export function mediaPrefsFromRow(row: {
  videoEffect: string;
  blurRadius: number;
  virtualBackgroundUrl: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  captionsDefault: boolean | null;
  tabReturnEnabled: boolean | null;
  tabReturnMic: string | null;
  tabReturnCamera: string | null;
}): MediaPrefs {
  return coerceMediaPrefs(row);
}
