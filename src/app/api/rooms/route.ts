import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getSession } from "@/lib/session";
import { createRoomWithBrand } from "@/lib/rooms";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/).optional(),
  boardId: z.string().optional(),
  accessPolicy: z.enum(["public", "members", "invite"]).optional(),
  themePreset: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const list = await db.query.rooms.findMany({
    where: eq(rooms.ownerIdentityId, session.identityId),
    orderBy: [desc(rooms.createdAt)],
  });
  return NextResponse.json({ rooms: list });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = createSchema.parse(await req.json());
  const { room } = await createRoomWithBrand({
    title: body.title,
    ownerIdentityId: session.identityId,
    slug: body.slug,
    boardId: body.boardId,
    accessPolicy: body.accessPolicy,
    themePreset: body.themePreset,
    kind: "persistent",
    useIdentityBrand: true,
  });

  return NextResponse.json({ room }, { status: 201 });
}
