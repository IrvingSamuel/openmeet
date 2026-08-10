import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { brandFieldsSchema } from "@/lib/brand-schema";
import {
  authorizeBearer,
  createRoomWithBrand,
  resolveOwnerIdentityId,
} from "@/lib/rooms";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  access_policy: z.enum(["public", "members", "invite"]).optional(),
  board_id: z.string().optional(),
  owner_identity_id: z.string().uuid().optional(),
  chronos_user_id: z.string().min(1).optional(),
  ui: brandFieldsSchema.optional(),
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

  let ownerIdentityId: string;
  try {
    if (session.isLoggedIn && session.identityId && !bearerOk) {
      ownerIdentityId = session.identityId;
    } else if (session.isLoggedIn && session.identityId && !body.owner_identity_id && !body.chronos_user_id) {
      ownerIdentityId = session.identityId;
    } else if (bearerOk) {
      ownerIdentityId = await resolveOwnerIdentityId({
        owner_identity_id: body.owner_identity_id,
        chronos_user_id: body.chronos_user_id,
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

  const { room, url, joinPath } = await createRoomWithBrand({
    title,
    ownerIdentityId,
    boardId: body.board_id,
    accessPolicy: body.access_policy || "public",
    kind: "instant",
    ui: body.ui,
    // API with explicit ui uses that; otherwise seed from owner defaults
    useIdentityBrand: !body.ui,
  });

  return NextResponse.json(
    {
      room_id: room.id,
      slug: room.slug,
      url,
      join_path: joinPath,
      kind: room.kind,
      access_policy: room.accessPolicy,
      title: room.title,
    },
    { status: 201 },
  );
}
