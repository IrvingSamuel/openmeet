import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms, roomBrands } from "@/db/schema";
import { getSession } from "@/lib/session";
import { BOARD_THEMES } from "@/lib/brand";
import { getBoard } from "@/lib/chronos-mcp";
import { getValidAccessToken } from "@/lib/chronos-oauth";

const updateSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  wordmark: z.string().max(120).nullable().optional(),
  themePreset: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  tertiaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  background: z.string().optional(),
  lobbyTitle: z.string().optional(),
  lobbySubtitle: z.string().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  customCss: z.string().nullable().optional(),
  importFromBoard: z.boolean().optional(),
});

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

  for (const key of [
    "logoUrl",
    "wordmark",
    "themePreset",
    "primaryColor",
    "secondaryColor",
    "tertiaryColor",
    "fontFamily",
    "background",
    "lobbyTitle",
    "lobbySubtitle",
    "faviconUrl",
    "customCss",
  ] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (body.themePreset && BOARD_THEMES[body.themePreset] && !body.primaryColor) {
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
