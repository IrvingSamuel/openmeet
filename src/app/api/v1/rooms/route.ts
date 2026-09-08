import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  brandAdvancedSchema,
  brandGroupsToFields,
  brandIdentitySchema,
  brandPaletteSchema,
  brandRowToPublic,
} from "@/lib/api-brand";
import { createRoomWithBrand } from "@/lib/rooms";
import { resolveV1Owner } from "@/lib/v1-auth";

const schema = z.object({
  /** Nome de identificação do template (não é o título da reunião). */
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  access_policy: z.enum(["public", "members", "invite"]).optional(),
  board_id: z.string().optional(),
  owner_identity_id: z.string().uuid().optional(),
  chronos_user_id: z.string().min(1).optional(),
  owner_user_id: z.string().uuid().optional(),
  external_id: z.string().min(1).optional(),
  identity: brandIdentitySchema.optional(),
  palette: brandPaletteSchema.optional(),
  advanced: brandAdvancedSchema.optional(),
});

/**
 * POST /api/v1/rooms — create a brand-template room (sala padrão).
 * Personalization groups are optional; omitted fields use platform defaults.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: String(err) },
      { status: 400 },
    );
  }

  const owner = await resolveV1Owner({
    req,
    owner_identity_id: body.owner_identity_id,
    owner_user_id: body.owner_user_id,
    external_id: body.external_id,
    chronos_user_id: body.chronos_user_id,
    title: body.name,
  });
  if (owner instanceof NextResponse) return owner;

  const ui = brandGroupsToFields({
    identity: body.identity,
    palette: body.palette,
    advanced: body.advanced,
  });

  try {
    const { room, brand, url, joinPath } = await createRoomWithBrand({
      title: body.name.trim(),
      ownerIdentityId: owner.ownerIdentityId,
      slug: body.slug,
      boardId: body.board_id,
      accessPolicy: body.access_policy || "public",
      kind: "persistent",
      ui,
      // Platform defaults when no personalization — not owner identity brand.
      useIdentityBrand: false,
    });

    return NextResponse.json(
      {
        room_id: room.id,
        name: room.title,
        slug: room.slug,
        url,
        join_path: joinPath,
        access_policy: room.accessPolicy,
        brand: brandRowToPublic(brand as unknown as Record<string, unknown>),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "create_failed", detail: message },
      { status: 500 },
    );
  }
}
