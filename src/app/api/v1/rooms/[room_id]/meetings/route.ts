import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { createMeetingWithBrand } from "@/lib/meetings";
import {
  clampEmptyTimeoutSec,
  resolveEmptyTimeoutSec,
} from "@/lib/meeting-timeouts";
import { authorizeBearer } from "@/lib/rooms";
import { getSession } from "@/lib/session";

const schema = z.object({
  /** Título da reunião (obrigatório — definido pela plataforma terceirizada). */
  title: z.string().min(1).max(200),
  access_policy: z.enum(["public", "members", "invite"]).optional(),
  empty_timeout_sec: z.number().int().optional(),
  board_id: z.string().optional(),
});

/**
 * POST /api/v1/rooms/{room_id}/meetings
 * Create a meeting from a predefined room template. Brand is snapshotted from
 * the room; meeting title is provided by the caller.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ room_id: string }> },
) {
  const session = await getSession();
  const bearerOk = authorizeBearer(req);

  if (!bearerOk && !(session.isLoggedIn && session.identityId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { room_id: roomId } = await ctx.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId,
    )
  ) {
    return NextResponse.json({ error: "invalid_room_id" }, { status: 400 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: String(err) },
      { status: 400 },
    );
  }

  let emptyTimeoutSec: number | null = null;
  try {
    emptyTimeoutSec = clampEmptyTimeoutSec(body.empty_timeout_sec);
  } catch {
    return NextResponse.json(
      {
        error: "empty_timeout_sec_out_of_range",
        detail: "empty_timeout_sec must be between 60 and 86400",
      },
      { status: 400 },
    );
  }

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, roomId),
  });
  if (!room) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }

  // Session users may only start meetings from rooms they own.
  if (!bearerOk && session.identityId && room.ownerIdentityId !== session.identityId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { meeting, url, joinPath } = await createMeetingWithBrand({
      title: body.title.trim(),
      ownerIdentityId: room.ownerIdentityId,
      roomId: room.id,
      boardId: body.board_id ?? room.boardId,
      accessPolicy:
        body.access_policy ||
        (room.accessPolicy as "public" | "members" | "invite"),
      useIdentityBrand: false,
      emptyTimeoutSec,
    });

    return NextResponse.json(
      {
        meeting_id: meeting.id,
        slug: meeting.slug,
        url,
        join_path: joinPath,
        access_policy: meeting.accessPolicy,
        title: meeting.title,
        brand_room_id: meeting.roomId,
        empty_timeout_sec: resolveEmptyTimeoutSec(meeting.emptyTimeoutSec),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "room_template_not_found") {
      return NextResponse.json({ error: "room_not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "create_failed", detail: message },
      { status: 500 },
    );
  }
}
