import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  brandAdvancedSchema,
  brandIdentitySchema,
  brandPaletteSchema,
  resolveApiBrandUi,
} from "@/lib/api-brand";
import { brandFieldsSchema } from "@/lib/brand-schema";
import { parseRedirectAfterMeet } from "@/lib/host-entry";
import { createMeetingWithBrand } from "@/lib/meetings";
import {
  clampEmptyTimeoutSec,
  resolveEmptyTimeoutSec,
} from "@/lib/meeting-timeouts";
import { resolveV1Owner } from "@/lib/v1-auth";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  access_policy: z.enum(["public", "members", "invite"]).optional(),
  board_id: z.string().optional(),
  /**
   * Brand template room — visual only; does not create or own the meeting.
   * Prefer POST /api/v1/rooms/{room_id}/meetings for the from-room flow.
   */
  room_id: z.string().uuid().optional(),
  owner_identity_id: z.string().uuid().optional(),
  owner_user_id: z.string().uuid().optional(),
  external_id: z.string().min(1).optional(),
  /** @deprecated Prefer identity / palette / advanced groups. */
  ui: brandFieldsSchema.optional(),
  identity: brandIdentitySchema.optional(),
  palette: brandPaletteSchema.optional(),
  advanced: brandAdvancedSchema.optional(),
  /** Seconds after last participant leaves before the room auto-ends (60–86400). */
  empty_timeout_sec: z.number().int().optional(),
  /** Absolute http(s) URL to return to after leave/end. */
  redirect_after_meet: z.string().max(2000).nullable().optional(),
  /**
   * Keep guests in lobby until a host joins. Defaults to true when
   * access_policy is "invite".
   */
  wait_for_host: z.boolean().optional(),
});

function meetingCreateResponse(result: Awaited<ReturnType<typeof createMeetingWithBrand>>) {
  const { meeting, url, joinPath, hostUrl, hostPath } = result;
  return {
    meeting_id: meeting.id,
    slug: meeting.slug,
    url,
    join_path: joinPath,
    host_url: hostUrl,
    host_path: hostPath,
    access_policy: meeting.accessPolicy,
    title: meeting.title,
    brand_room_id: meeting.roomId,
    empty_timeout_sec: resolveEmptyTimeoutSec(meeting.emptyTimeoutSec),
    redirect_after_meet: meeting.redirectAfterMeet ?? null,
    wait_for_host: meeting.waitForHost,
  };
}

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
    title: body.title,
  });
  if (owner instanceof NextResponse) return owner;

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

  let redirectAfterMeet: string | null = null;
  try {
    redirectAfterMeet = parseRedirectAfterMeet(body.redirect_after_meet);
  } catch (err) {
    const code = err instanceof Error ? err.message : "redirect_after_meet_invalid";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const ui = resolveApiBrandUi({
    ui: body.ui,
    identity: body.identity,
    palette: body.palette,
    advanced: body.advanced,
  });

  const title =
    body.title?.trim() ||
    `Instant ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  const accessPolicy = body.access_policy || "public";
  const waitForHost =
    body.wait_for_host !== undefined
      ? body.wait_for_host
      : accessPolicy === "invite";

  try {
    const result = await createMeetingWithBrand({
      title,
      ownerIdentityId: owner.ownerIdentityId,
      boardId: body.board_id,
      accessPolicy,
      roomId: body.room_id ?? null,
      ui,
      useIdentityBrand: !ui,
      emptyTimeoutSec,
      redirectAfterMeet,
      waitForHost,
      issueHostEntry: true,
    });

    return NextResponse.json(meetingCreateResponse(result), { status: 201 });
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
