import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms, roomBrands } from "@/db/schema";
import { getSession } from "@/lib/session";
import { deleteRoomFully } from "@/lib/rooms";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  boardId: z.string().nullable().optional(),
  accessPolicy: z.enum(["public", "members", "invite"]).optional(),
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
  return NextResponse.json({ room, brand });
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
  if (
    body.title === undefined &&
    body.boardId === undefined &&
    body.accessPolicy === undefined
  ) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const patch: {
    title?: string;
    boardId?: string | null;
    accessPolicy?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.boardId !== undefined) patch.boardId = body.boardId;
  if (body.accessPolicy !== undefined) patch.accessPolicy = body.accessPolicy;

  const [updated] = await db
    .update(rooms)
    .set(patch)
    .where(eq(rooms.id, room.id))
    .returning();

  // Keep lobby/wordmark in sync when they still mirror the previous room title.
  if (body.title !== undefined) {
    const brand = await db.query.roomBrands.findFirst({
      where: eq(roomBrands.roomId, room.id),
    });
    if (brand) {
      const brandPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (!brand.lobbyTitle || brand.lobbyTitle === room.title) {
        brandPatch.lobbyTitle = patch.title;
      }
      if (!brand.wordmark || brand.wordmark === room.title) {
        brandPatch.wordmark = patch.title;
      }
      if (Object.keys(brandPatch).length > 1) {
        await db
          .update(roomBrands)
          .set(brandPatch)
          .where(eq(roomBrands.roomId, room.id));
      }
    }
  }

  return NextResponse.json({ room: updated });
}

export async function DELETE(
  _req: NextRequest,
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

  await deleteRoomFully(room);
  return NextResponse.json({ ok: true, slug });
}
