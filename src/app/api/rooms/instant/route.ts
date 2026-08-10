import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createRoomWithBrand } from "@/lib/rooms";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  boardId: z.string().optional(),
  accessPolicy: z.enum(["public", "members", "invite"]).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof schema> = {};
  try {
    const raw = await req.json();
    body = schema.parse(raw ?? {});
  } catch {
    body = {};
  }

  const title =
    body.title?.trim() ||
    `Instant ${new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

  const { room, url, joinPath } = await createRoomWithBrand({
    title,
    ownerIdentityId: session.identityId,
    boardId: body.boardId,
    accessPolicy: body.accessPolicy || "public",
    kind: "instant",
    useIdentityBrand: true,
  });

  return NextResponse.json(
    { room, url, join_path: joinPath },
    { status: 201 },
  );
}
