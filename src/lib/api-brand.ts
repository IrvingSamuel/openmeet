import { z } from "zod";
import {
  assetUrlSchema,
  brandFieldsSchema,
  paintSchema,
  type BrandFieldsInput,
} from "@/lib/brand-schema";

/** Identidade — lobby, logo e wordmark (snake_case na API pública). */
export const brandIdentitySchema = z.object({
  lobby_title: z.string().optional(),
  lobby_subtitle: z.string().optional(),
  logo_url: assetUrlSchema,
  wordmark: z.string().max(120).nullable().optional(),
});

/** Paleta — tema, cores, padrão e animação de fundo. */
export const brandPaletteSchema = z.object({
  theme_preset: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  tertiary_color: z.string().optional(),
  background: z.string().optional(),
  primary_paint: paintSchema.optional(),
  secondary_paint: paintSchema.optional(),
  tertiary_paint: paintSchema.optional(),
  background_paint: paintSchema.optional(),
  pattern_url: assetUrlSchema,
  pattern_size_mode: z.enum(["percent", "fixed"]).nullable().optional(),
  pattern_size: z.number().int().min(1).max(512).nullable().optional(),
  pattern_tint: z
    .enum(["none", "primary", "secondary", "tertiary", "custom"])
    .nullable()
    .optional(),
  pattern_tint_color: z.string().nullable().optional(),
  pattern_tint_opacity: z.number().int().min(0).max(100).nullable().optional(),
  bg_animation: z
    .enum(["none", "wave", "beam", "aurora", "pulse"])
    .nullable()
    .optional(),
  bg_animation_speed: z.number().int().min(1).max(10).nullable().optional(),
});

/** Avançado — tipografia, favicon e CSS customizado. */
export const brandAdvancedSchema = z.object({
  font_family: z.string().optional(),
  favicon_url: assetUrlSchema,
  custom_css: z.string().nullable().optional(),
});

export type BrandIdentityInput = z.infer<typeof brandIdentitySchema>;
export type BrandPaletteInput = z.infer<typeof brandPaletteSchema>;
export type BrandAdvancedInput = z.infer<typeof brandAdvancedSchema>;

/** Optional personalization groups accepted by public v1 room/meeting APIs. */
export const brandGroupsSchema = z.object({
  identity: brandIdentitySchema.optional(),
  palette: brandPaletteSchema.optional(),
  advanced: brandAdvancedSchema.optional(),
});

/**
 * Map snake_case identity/palette/advanced groups into the internal
 * camelCase BrandFieldsInput used by createRoomWithBrand / createMeetingWithBrand.
 */
export function brandGroupsToFields(input: {
  identity?: BrandIdentityInput | null;
  palette?: BrandPaletteInput | null;
  advanced?: BrandAdvancedInput | null;
}): BrandFieldsInput | undefined {
  const raw: Record<string, unknown> = {};

  const identity = input.identity;
  if (identity) {
    if (identity.lobby_title !== undefined) raw.lobbyTitle = identity.lobby_title;
    if (identity.lobby_subtitle !== undefined) {
      raw.lobbySubtitle = identity.lobby_subtitle;
    }
    if (identity.logo_url !== undefined) raw.logoUrl = identity.logo_url;
    if (identity.wordmark !== undefined) raw.wordmark = identity.wordmark;
  }

  const palette = input.palette;
  if (palette) {
    if (palette.theme_preset !== undefined) raw.themePreset = palette.theme_preset;
    if (palette.primary_color !== undefined) {
      raw.primaryColor = palette.primary_color;
    }
    if (palette.secondary_color !== undefined) {
      raw.secondaryColor = palette.secondary_color;
    }
    if (palette.tertiary_color !== undefined) {
      raw.tertiaryColor = palette.tertiary_color;
    }
    if (palette.background !== undefined) raw.background = palette.background;
    if (palette.primary_paint !== undefined) {
      raw.primaryPaint = palette.primary_paint;
    }
    if (palette.secondary_paint !== undefined) {
      raw.secondaryPaint = palette.secondary_paint;
    }
    if (palette.tertiary_paint !== undefined) {
      raw.tertiaryPaint = palette.tertiary_paint;
    }
    if (palette.background_paint !== undefined) {
      raw.backgroundPaint = palette.background_paint;
    }
    if (palette.pattern_url !== undefined) raw.patternUrl = palette.pattern_url;
    if (palette.pattern_size_mode !== undefined) {
      raw.patternSizeMode = palette.pattern_size_mode;
    }
    if (palette.pattern_size !== undefined) {
      raw.patternSize = palette.pattern_size;
    }
    if (palette.pattern_tint !== undefined) {
      raw.patternTint = palette.pattern_tint;
    }
    if (palette.pattern_tint_color !== undefined) {
      raw.patternTintColor = palette.pattern_tint_color;
    }
    if (palette.pattern_tint_opacity !== undefined) {
      raw.patternTintOpacity = palette.pattern_tint_opacity;
    }
    if (palette.bg_animation !== undefined) {
      raw.bgAnimation = palette.bg_animation;
    }
    if (palette.bg_animation_speed !== undefined) {
      raw.bgAnimationSpeed = palette.bg_animation_speed;
    }
  }

  const advanced = input.advanced;
  if (advanced) {
    if (advanced.font_family !== undefined) {
      raw.fontFamily = advanced.font_family;
    }
    if (advanced.favicon_url !== undefined) {
      raw.faviconUrl = advanced.favicon_url;
    }
    if (advanced.custom_css !== undefined) {
      raw.customCss = advanced.custom_css;
    }
  }

  if (Object.keys(raw).length === 0) return undefined;
  return brandFieldsSchema.parse(raw);
}

/**
 * Resolve UI override from either legacy camelCase `ui` or the new
 * identity/palette/advanced groups. Groups win over `ui` when both are sent
 * for the same key (groups are merged on top of ui).
 */
export function resolveApiBrandUi(input: {
  ui?: BrandFieldsInput;
  identity?: BrandIdentityInput | null;
  palette?: BrandPaletteInput | null;
  advanced?: BrandAdvancedInput | null;
}): BrandFieldsInput | undefined {
  const fromGroups = brandGroupsToFields({
    identity: input.identity,
    palette: input.palette,
    advanced: input.advanced,
  });
  if (!input.ui && !fromGroups) return undefined;
  if (!input.ui) return fromGroups;
  if (!fromGroups) return input.ui;
  return brandFieldsSchema.parse({ ...input.ui, ...fromGroups });
}

/** Serialize a brand row to snake_case for public API responses. */
export function brandRowToPublic(brand: Record<string, unknown>) {
  return {
    identity: {
      lobby_title: brand.lobbyTitle ?? null,
      lobby_subtitle: brand.lobbySubtitle ?? null,
      logo_url: brand.logoUrl ?? null,
      wordmark: brand.wordmark ?? null,
    },
    palette: {
      theme_preset: brand.themePreset ?? null,
      primary_color: brand.primaryColor ?? null,
      secondary_color: brand.secondaryColor ?? null,
      tertiary_color: brand.tertiaryColor ?? null,
      background: brand.background ?? null,
      primary_paint: brand.primaryPaint ?? null,
      secondary_paint: brand.secondaryPaint ?? null,
      tertiary_paint: brand.tertiaryPaint ?? null,
      background_paint: brand.backgroundPaint ?? null,
      pattern_url: brand.patternUrl ?? null,
      pattern_size_mode: brand.patternSizeMode ?? null,
      pattern_size: brand.patternSize ?? null,
      pattern_tint: brand.patternTint ?? null,
      pattern_tint_color: brand.patternTintColor ?? null,
      pattern_tint_opacity: brand.patternTintOpacity ?? null,
      bg_animation: brand.bgAnimation ?? null,
      bg_animation_speed: brand.bgAnimationSpeed ?? null,
    },
    advanced: {
      font_family: brand.fontFamily ?? null,
      favicon_url: brand.faviconUrl ?? null,
      custom_css: brand.customCss ?? null,
    },
  };
}
