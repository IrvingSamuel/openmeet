import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getSession } from "@/lib/session";
import { createMeetingWithBrand } from "@/lib/meetings";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  accessPolicy: z.enum(["public", "members", "invite"]).optional(),
});

/** Start an independent meeting using this room as a brand template only. */
export async function POST(
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

  let body: z.infer<typeof schema> = {};
  try {
    body = schema.parse(await req.json().catch(() => ({})));
  } catch {
    body = {};
  }

  const title = body.title?.trim() || room.title;

  const { meeting, url, joinPath } = await createMeetingWithBrand({
    title,
    ownerIdentityId: session.identityId,
    roomId: room.id,
    boardId: room.boardId,
    accessPolicy: body.accessPolicy || (room.accessPolicy as "public" | "members" | "invite"),
    useIdentityBrand: false,
  });

  return NextResponse.json(
    {
      meeting,
      meeting_id: meeting.id,
      slug: meeting.slug,
      url,
      join_path: joinPath,
    },
    { status: 201 },
  );
}
