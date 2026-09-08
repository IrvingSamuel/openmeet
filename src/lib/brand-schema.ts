import { z } from "zod";
import type { PaintToken } from "@/lib/brand";

const paintStopSchema = z.object({
  color: z.string().min(1).max(64),
  at: z.number().min(0).max(100),
});

export const paintSchema = z
  .object({
    mode: z.enum(["solid", "gradient"]),
    solid: z.string().min(1).max(64),
    gradient: z
      .object({
        type: z.enum(["linear", "radial"]),
        angle: z.number().min(0).max(360),
        stops: z.array(paintStopSchema).min(2).max(5),
      })
      .optional(),
  })
  .nullable();

/** Absolute http(s) URL or site-relative path (e.g. /brand-assets/…). */
export const assetUrlSchema = z
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

/** Shared brand/UI fields for room brands, identity defaults, and API `ui`. */
export const brandFieldsSchema = z.object({
  logoUrl: assetUrlSchema,
  wordmark: z.string().max(120).nullable().optional(),
  themePreset: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  tertiaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  background: z.string().optional(),
  lobbyTitle: z.string().optional(),
  lobbySubtitle: z.string().optional(),
  faviconUrl: assetUrlSchema,
  customCss: z.string().nullable().optional(),
  primaryPaint: paintSchema.optional(),
  secondaryPaint: paintSchema.optional(),
  tertiaryPaint: paintSchema.optional(),
  backgroundPaint: paintSchema.optional(),
  patternUrl: assetUrlSchema,
  patternSizeMode: z.enum(["percent", "fixed"]).nullable().optional(),
  patternSize: z.number().int().min(1).max(512).nullable().optional(),
  patternTint: z
    .enum(["none", "primary", "secondary", "tertiary", "custom"])
    .nullable()
    .optional(),
  patternTintColor: z.string().nullable().optional(),
  patternTintOpacity: z.number().int().min(0).max(100).nullable().optional(),
  bgAnimation: z
    .enum(["none", "wave", "beam", "aurora", "pulse"])
    .nullable()
    .optional(),
  bgAnimationSpeed: z.number().int().min(1).max(10).nullable().optional(),
});

export type BrandFieldsInput = z.infer<typeof brandFieldsSchema>;

export function normalizeAssetUrl(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value;
}

export function syncSolidFromPaint(
  paint: PaintToken | null | undefined,
  fallback?: string,
): string | undefined {
  if (!paint) return fallback;
  return paint.solid || paint.gradient?.stops?.[0]?.color || fallback;
}

const BRAND_SCALAR_KEYS = [
  "wordmark",
  "themePreset",
  "primaryColor",
  "secondaryColor",
  "tertiaryColor",
  "fontFamily",
  "background",
  "lobbyTitle",
  "lobbySubtitle",
  "customCss",
  "primaryPaint",
  "secondaryPaint",
  "tertiaryPaint",
  "backgroundPaint",
  "patternSizeMode",
  "patternSize",
  "patternTint",
  "patternTintColor",
  "patternTintOpacity",
  "bgAnimation",
  "bgAnimationSpeed",
] as const;

/** Build a DB patch from validated brand fields (no importFromBoard). */
export function brandFieldsToPatch(
  body: BrandFieldsInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const logoUrl = normalizeAssetUrl(body.logoUrl);
  const faviconUrl = normalizeAssetUrl(body.faviconUrl);
  const patternUrl = normalizeAssetUrl(body.patternUrl);
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  if (faviconUrl !== undefined) patch.faviconUrl = faviconUrl;
  if (patternUrl !== undefined) patch.patternUrl = patternUrl;

  for (const key of BRAND_SCALAR_KEYS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (body.primaryPaint !== undefined) {
    const solid = syncSolidFromPaint(
      body.primaryPaint ?? undefined,
      body.primaryColor,
    );
    if (solid) patch.primaryColor = solid;
  }
  if (body.secondaryPaint !== undefined) {
    const solid = syncSolidFromPaint(
      body.secondaryPaint ?? undefined,
      body.secondaryColor,
    );
    if (solid) patch.secondaryColor = solid;
  }
  if (body.tertiaryPaint !== undefined) {
    const solid = syncSolidFromPaint(
      body.tertiaryPaint ?? undefined,
      body.tertiaryColor,
    );
    if (solid) patch.tertiaryColor = solid;
  }
  if (body.backgroundPaint !== undefined) {
    const solid = syncSolidFromPaint(
      body.backgroundPaint ?? undefined,
      body.background,
    );
    if (solid) patch.background = solid;
  }

  return patch;
}
