import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { rooms, roomBrands } from "@/db/schema";
import { getSession } from "@/lib/session";
import { BOARD_THEMES } from "@/lib/brand";

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
  const slug = body.slug || nanoid(10).toLowerCase();
  const livekitRoomName = `meet_${slug}`;
  const preset = body.themePreset && BOARD_THEMES[body.themePreset] ? body.themePreset : "indigo";
  const colors = BOARD_THEMES[preset];

  const [room] = await db
    .insert(rooms)
    .values({
      slug,
      title: body.title,
      ownerIdentityId: session.identityId,
      boardId: body.boardId,
      accessPolicy: body.accessPolicy || "members",
      livekitRoomName,
    })
    .returning();

  await db.insert(roomBrands).values({
    roomId: room.id,
    themePreset: preset,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: body.title,
    lobbyTitle: body.title,
    lobbySubtitle: "Powered by Chronos Meet",
  });

  return NextResponse.json({ room }, { status: 201 });
}
