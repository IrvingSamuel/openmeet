import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rooms, meetings, transcriptSegments } from "@/db/schema";
import {
  brandAdvancedSchema,
  brandGroupsToFields,
  brandIdentitySchema,
  brandPaletteSchema,
  brandRowToPublic,
  resolveApiBrandUi,
} from "@/lib/api-brand";
import { parseRedirectAfterMeet } from "@/lib/host-entry";
import { createMeetingWithBrand } from "@/lib/meetings";
import {
  clampEmptyTimeoutSec,
  resolveEmptyTimeoutSec,
} from "@/lib/meeting-timeouts";
import {
  authorizePublicApi,
  createRoomWithBrand,
  resolveOwnerIdentityId,
} from "@/lib/rooms";

/**
 * Minimal MCP-compatible HTTP endpoint for Meet tools.
 * Auth: Bearer public API token (Admin) or MEET_MCP_TOKEN.
 */
async function authorize(req: NextRequest) {
  return authorizePublicApi(req);
}

const ownerFields = {
  owner_identity_id: z.string().uuid().optional(),
  owner_user_id: z.string().uuid().optional(),
  external_id: z.string().min(1).optional(),
};

async function resolveMcpOwner(
  args: {
    owner_identity_id?: string;
    owner_user_id?: string;
    external_id?: string;
    title?: string;
  },
  defaultOwnerId: string | null | undefined,
): Promise<string> {
  if (args.owner_identity_id || args.owner_user_id || args.external_id) {
    return resolveOwnerIdentityId({
      owner_identity_id: args.owner_identity_id || args.owner_user_id,
      external_id: args.external_id,
      title: args.title,
    });
  }
  if (defaultOwnerId) return defaultOwnerId;
  throw new Error("owner_identity_id or external_id required");
}

async function meetCreateRoom(
  args: {
    name: string;
    board_id?: string;
    owner_identity_id?: string;
    owner_user_id?: string;
    external_id?: string;
    slug?: string;
    access_policy?: "public" | "members" | "invite";
    identity?: z.infer<typeof brandIdentitySchema>;
    palette?: z.infer<typeof brandPaletteSchema>;
    advanced?: z.infer<typeof brandAdvancedSchema>;
  },
  defaultOwnerId: string | null | undefined,
) {
  const ownerIdentityId = await resolveMcpOwner(
    { ...args, title: args.name },
    defaultOwnerId,
  );
  const ui = brandGroupsToFields({
    identity: args.identity,
    palette: args.palette,
    advanced: args.advanced,
  });
  const { room, brand, url } = await createRoomWithBrand({
    title: args.name,
    ownerIdentityId,
    boardId: args.board_id,
    slug: args.slug,
    kind: "persistent",
    accessPolicy: args.access_policy || "public",
    ui,
    useIdentityBrand: false,
  });
  return {
    room_id: room.id,
    name: room.title,
    slug: room.slug,
    url,
    brand: brandRowToPublic(brand as unknown as Record<string, unknown>),
  };
}

async function meetCreateMeetingFromRoom(args: {
  room_id: string;
  title: string;
  access_policy?: "public" | "members" | "invite";
  empty_timeout_sec?: number;
  board_id?: string;
  redirect_after_meet?: string | null;
  wait_for_host?: boolean;
}) {
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, args.room_id),
  });
  if (!room) throw new Error("room_not_found");

  const emptyTimeoutSec = clampEmptyTimeoutSec(args.empty_timeout_sec);
  const redirectAfterMeet = parseRedirectAfterMeet(args.redirect_after_meet);
  const accessPolicy =
    args.access_policy ||
    (room.accessPolicy as "public" | "members" | "invite");
  const waitForHost =
    args.wait_for_host !== undefined
      ? args.wait_for_host
      : accessPolicy === "invite";
  const { meeting, url, joinPath, hostUrl, hostPath } =
    await createMeetingWithBrand({
      title: args.title.trim(),
      ownerIdentityId: room.ownerIdentityId,
      roomId: room.id,
      boardId: args.board_id ?? room.boardId,
      accessPolicy,
      useIdentityBrand: false,
      emptyTimeoutSec,
      redirectAfterMeet,
      waitForHost,
      issueHostEntry: true,
    });
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

async function meetCreateInstantMeeting(
  args: {
    title?: string;
    board_id?: string;
    room_id?: string;
    owner_identity_id?: string;
    owner_user_id?: string;
    external_id?: string;
    access_policy?: "public" | "members" | "invite";
    empty_timeout_sec?: number;
    redirect_after_meet?: string | null;
    wait_for_host?: boolean;
    identity?: z.infer<typeof brandIdentitySchema>;
    palette?: z.infer<typeof brandPaletteSchema>;
    advanced?: z.infer<typeof brandAdvancedSchema>;
  },
  defaultOwnerId: string | null | undefined,
) {
  const ownerIdentityId = await resolveMcpOwner(args, defaultOwnerId);
  const ui = resolveApiBrandUi({
    identity: args.identity,
    palette: args.palette,
    advanced: args.advanced,
  });
  const title =
    args.title?.trim() ||
    `Instant ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const emptyTimeoutSec = clampEmptyTimeoutSec(args.empty_timeout_sec);
  const redirectAfterMeet = parseRedirectAfterMeet(args.redirect_after_meet);
  const accessPolicy = args.access_policy || "public";
  const waitForHost =
    args.wait_for_host !== undefined
      ? args.wait_for_host
      : accessPolicy === "invite";
  const { meeting, url, joinPath, hostUrl, hostPath } =
    await createMeetingWithBrand({
      title,
      ownerIdentityId,
      boardId: args.board_id,
      accessPolicy,
      roomId: args.room_id ?? null,
      ui,
      useIdentityBrand: !ui,
      emptyTimeoutSec,
      redirectAfterMeet,
      waitForHost,
      issueHostEntry: true,
    });
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

async function meetGetTranscript(args: {
  meeting_id?: string;
  room_slug?: string;
  meeting_slug?: string;
}) {
  let meetingId = args.meeting_id;
  if (!meetingId && args.meeting_slug) {
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.slug, args.meeting_slug),
    });
    meetingId = meeting?.id;
  }
  if (!meetingId && args.room_slug) {
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.slug, args.room_slug),
    });
    if (!meeting) {
      const room = await db.query.rooms.findFirst({
        where: eq(rooms.slug, args.room_slug),
      });
      if (!room) throw new Error("room not found");
      const linked = await db.query.meetings.findFirst({
        where: eq(meetings.roomId, room.id),
      });
      meetingId = linked?.id;
    } else {
      meetingId = meeting.id;
    }
  }
  if (!meetingId) throw new Error("meeting_id or meeting_slug required");
  const segments = await db.query.transcriptSegments.findMany({
    where: eq(transcriptSegments.meetingId, meetingId),
    orderBy: [asc(transcriptSegments.createdAt)],
  });
  return {
    meeting_id: meetingId,
    segments: segments.map((s) => ({
      speaker: s.speakerLabel,
      text: s.text,
      at: s.createdAt,
    })),
  };
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "unauthorized" },
        id: null,
      },
      { status: 401 },
    );
  }

  const body = await req.json();
  const id = body.id ?? null;

  if (body.method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "meet_create_room",
            description:
              "Create an OpenMeet brand-template room (sala padrão). Returns room_id and /r/{slug} URL. Optional identity/palette/advanced personalization.",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "Template name (not meeting title)" },
                board_id: { type: "string" },
                owner_identity_id: { type: "string" },
                external_id: { type: "string" },
                slug: { type: "string" },
                access_policy: {
                  type: "string",
                  enum: ["public", "members", "invite"],
                },
                identity: { type: "object" },
                palette: { type: "object" },
                advanced: { type: "object" },
              },
              required: ["name"],
            },
          },
          {
            name: "meet_create_meeting_from_room",
            description:
              "Create a meeting from a predefined room template. Requires room_id and meeting title.",
            inputSchema: {
              type: "object",
              properties: {
                room_id: { type: "string", format: "uuid" },
                title: { type: "string" },
                access_policy: {
                  type: "string",
                  enum: ["public", "members", "invite"],
                },
                empty_timeout_sec: { type: "integer" },
                board_id: { type: "string" },
                redirect_after_meet: {
                  type: "string",
                  description: "Absolute http(s) URL after leave/end",
                },
                wait_for_host: {
                  type: "boolean",
                  description:
                    "Keep guests in lobby until a host joins (default true for invite)",
                },
              },
              required: ["room_id", "title"],
            },
          },
          {
            name: "meet_create_instant_meeting",
            description:
              "Create an instant meeting with optional identity/palette/advanced personalization.",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string" },
                board_id: { type: "string" },
                room_id: { type: "string" },
                owner_identity_id: { type: "string" },
                external_id: { type: "string" },
                access_policy: {
                  type: "string",
                  enum: ["public", "members", "invite"],
                },
                empty_timeout_sec: { type: "integer" },
                redirect_after_meet: { type: "string" },
                wait_for_host: { type: "boolean" },
                identity: { type: "object" },
                palette: { type: "object" },
                advanced: { type: "object" },
              },
            },
          },
          {
            name: "meet_get_transcript",
            description: "Get transcript segments for a meeting or room slug",
            inputSchema: {
              type: "object",
              properties: {
                meeting_id: { type: "string" },
                room_slug: { type: "string" },
              },
            },
          },
        ],
      },
    });
  }

  if (body.method === "tools/call") {
    const name = body.params?.name as string;
    const args = (body.params?.arguments || {}) as Record<string, unknown>;
    try {
      let result: unknown;
      if (name === "meet_create_room") {
        const parsed = z
          .object({
            name: z.string().min(1).max(200).optional(),
            /** @deprecated Prefer `name`. */
            title: z.string().min(1).max(200).optional(),
            board_id: z.string().optional(),
            slug: z.string().optional(),
            access_policy: z.enum(["public", "members", "invite"]).optional(),
            identity: brandIdentitySchema.optional(),
            palette: brandPaletteSchema.optional(),
            advanced: brandAdvancedSchema.optional(),
            ...ownerFields,
          })
          .refine((v) => Boolean(v.name || v.title), {
            message: "name required",
          })
          .parse(args);
        result = await meetCreateRoom(
          {
            ...parsed,
            name: (parsed.name || parsed.title)!,
          },
          auth.defaultOwnerId,
        );
      } else if (name === "meet_create_meeting_from_room") {
        const parsed = z
          .object({
            room_id: z.string().uuid(),
            title: z.string().min(1).max(200),
            access_policy: z.enum(["public", "members", "invite"]).optional(),
            empty_timeout_sec: z.number().int().optional(),
            board_id: z.string().optional(),
          })
          .parse(args);
        result = await meetCreateMeetingFromRoom(parsed);
      } else if (name === "meet_create_instant_meeting") {
        const parsed = z
          .object({
            title: z.string().min(1).max(200).optional(),
            board_id: z.string().optional(),
            room_id: z.string().uuid().optional(),
            access_policy: z.enum(["public", "members", "invite"]).optional(),
            empty_timeout_sec: z.number().int().optional(),
            identity: brandIdentitySchema.optional(),
            palette: brandPaletteSchema.optional(),
            advanced: brandAdvancedSchema.optional(),
            ...ownerFields,
          })
          .parse(args);
        result = await meetCreateInstantMeeting(parsed, auth.defaultOwnerId);
      } else if (name === "meet_get_transcript") {
        result = await meetGetTranscript(
          z
            .object({
              meeting_id: z.string().uuid().optional(),
              room_slug: z.string().optional(),
            })
            .parse(args),
        );
      } else {
        throw new Error(`unknown tool ${name}`);
      }
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      });
    } catch (e) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: e instanceof Error ? e.message : String(e),
            },
          ],
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" },
  });
}
