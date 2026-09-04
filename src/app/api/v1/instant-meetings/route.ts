import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { brandFieldsSchema } from "@/lib/brand-schema";
import { createMeetingWithBrand } from "@/lib/meetings";
import {
  clampEmptyTimeoutSec,
  resolveEmptyTimeoutSec,
} from "@/lib/meeting-timeouts";
import { authorizeBearer, resolveOwnerIdentityId } from "@/lib/rooms";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  access_policy: z.enum(["public", "members", "invite"]).optional(),
  board_id: z.string().optional(),
  /** Brand template room — visual only; does not create or own the meeting. */
  room_id: z.string().uuid().optional(),
  owner_identity_id: z.string().uuid().optional(),
  chronos_user_id: z.string().min(1).optional(),
  owner_user_id: z.string().uuid().optional(),
  external_id: z.string().min(1).optional(),
  ui: brandFieldsSchema.optional(),
  /** Seconds after last participant leaves before the room auto-ends (60–86400). */
  empty_timeout_sec: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  const bearerOk = authorizeBearer(req);

  if (!bearerOk && !(session.isLoggedIn && session.identityId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  let ownerIdentityId: string;
  try {
    if (
      session.isLoggedIn &&
      session.identityId &&
      (!bearerOk ||
        (!body.owner_identity_id &&
          !body.owner_user_id &&
          !body.external_id &&
          !body.chronos_user_id))
    ) {
      ownerIdentityId = session.identityId;
    } else if (bearerOk) {
      ownerIdentityId = await resolveOwnerIdentityId({
        owner_identity_id: body.owner_identity_id || body.owner_user_id,
        external_id: body.external_id || body.chronos_user_id,
        title: body.title,
      });
    } else {
      ownerIdentityId = session.identityId!;
    }
  } catch (err) {
    return NextResponse.json(
      { error: "owner_resolve_failed", detail: String(err) },
      { status: 400 },
    );
  }

  const title =
    body.title?.trim() ||
    `Instant ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  try {
    const { meeting, url, joinPath } = await createMeetingWithBrand({
      title,
      ownerIdentityId,
      boardId: body.board_id,
      accessPolicy: body.access_policy || "public",
      roomId: body.room_id ?? null,
      ui: body.ui,
      useIdentityBrand: !body.ui,
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
