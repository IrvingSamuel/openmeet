import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms, roomBrands } from "@/db/schema";
import { getSession } from "@/lib/session";
import { BOARD_THEMES, type PaintToken } from "@/lib/brand";
import { getBoard } from "@/lib/chronos-mcp";
import { getValidAccessToken } from "@/lib/chronos-oauth";

const paintStopSchema = z.object({
  color: z.string().min(1).max(64),
  at: z.number().min(0).max(100),
});

const paintSchema = z
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
const assetUrlSchema = z
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

const updateSchema = z.object({
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
  importFromBoard: z.boolean().optional(),
});

function normalizeUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value;
}

function syncSolidFromPaint(
  paint: PaintToken | null | undefined,
  fallback?: string,
): string | undefined {
  if (!paint) return fallback;
  return paint.solid || paint.gradient?.stops?.[0]?.color || fallback;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const brand = await db.query.roomBrands.findFirst({
    where: eq(roomBrands.roomId, room.id),
  });
  return NextResponse.json({ brand, themes: BOARD_THEMES });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { slug } = await ctx.params;
  const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (room.ownerIdentityId !== session.identityId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = updateSchema.parse(await req.json());
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.importFromBoard && room.boardId) {
    try {
      const accessToken = await getValidAccessToken(session.identityId);
      const boardRes = await getBoard(accessToken, room.boardId);
      if (boardRes.ok && boardRes.result && typeof boardRes.result === "object") {
        const b = boardRes.result as {
          logo_url?: string;
          theme?: string;
          name?: string;
        };
        if (b.logo_url) patch.logoUrl = b.logo_url;
        if (b.theme && BOARD_THEMES[b.theme]) {
          patch.themePreset = b.theme;
          patch.primaryColor = BOARD_THEMES[b.theme].primary;
          patch.secondaryColor = BOARD_THEMES[b.theme].secondary;
          patch.tertiaryColor = BOARD_THEMES[b.theme].tertiary;
          patch.primaryPaint = null;
          patch.secondaryPaint = null;
          patch.tertiaryPaint = null;
        }
        if (b.name) {
          patch.wordmark = b.name;
          patch.lobbyTitle = b.name;
        }
      }
    } catch {
      // Board import is best-effort; continue with manual brand fields.
    }
  }

  const logoUrl = normalizeUrl(body.logoUrl);
  const faviconUrl = normalizeUrl(body.faviconUrl);
  const patternUrl = normalizeUrl(body.patternUrl);
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  if (faviconUrl !== undefined) patch.faviconUrl = faviconUrl;
  if (patternUrl !== undefined) patch.patternUrl = patternUrl;

  for (const key of [
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
  ] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // Keep hex columns in sync with paint solids when paints are provided.
  if (body.primaryPaint !== undefined) {
    const solid = syncSolidFromPaint(body.primaryPaint ?? undefined, body.primaryColor);
    if (solid) patch.primaryColor = solid;
  }
  if (body.secondaryPaint !== undefined) {
    const solid = syncSolidFromPaint(body.secondaryPaint ?? undefined, body.secondaryColor);
    if (solid) patch.secondaryColor = solid;
  }
  if (body.tertiaryPaint !== undefined) {
    const solid = syncSolidFromPaint(body.tertiaryPaint ?? undefined, body.tertiaryColor);
    if (solid) patch.tertiaryColor = solid;
  }
  if (body.backgroundPaint !== undefined) {
    const solid = syncSolidFromPaint(body.backgroundPaint ?? undefined, body.background);
    if (solid) patch.background = solid;
  }

  if (body.themePreset && BOARD_THEMES[body.themePreset] && !body.primaryColor && body.primaryPaint === undefined) {
    const c = BOARD_THEMES[body.themePreset];
    patch.primaryColor = c.primary;
    patch.secondaryColor = c.secondary;
    patch.tertiaryColor = c.tertiary;
  }

  const [brand] = await db
    .update(roomBrands)
    .set(patch)
    .where(eq(roomBrands.roomId, room.id))
    .returning();

  return NextResponse.json({ brand });
}
