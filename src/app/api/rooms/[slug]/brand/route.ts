import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms, roomBrands } from "@/db/schema";
import { getSession } from "@/lib/session";
import { BOARD_THEMES } from "@/lib/brand";
import {
  brandFieldsSchema,
  brandFieldsToPatch,
} from "@/lib/brand-schema";

const updateSchema = brandFieldsSchema;

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
  const patch: Record<string, unknown> = {
    ...brandFieldsToPatch(body),
    updatedAt: new Date(),
  };

  if (
    body.themePreset &&
    BOARD_THEMES[body.themePreset] &&
    !body.primaryColor &&
    body.primaryPaint === undefined
  ) {
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
