import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  chronosIdentities,
  rooms,
  roomBrands,
  meetings,
  transcriptSegments,
} from "@/db/schema";
import { BOARD_THEMES } from "@/lib/brand";
import { asc } from "drizzle-orm";

/**
 * Minimal MCP-compatible HTTP endpoint for Meet tools.
 * Auth: Bearer AGENT_SHARED_SECRET or MCP-style token in MEET_MCP_TOKEN.
 */
function authorize(req: NextRequest) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const expected =
    process.env.MEET_MCP_TOKEN || process.env.AGENT_SHARED_SECRET || "";
  if (!expected) return false;
  return token === expected;
}

async function resolveOwnerIdentityId(args: {
  owner_identity_id?: string;
  chronos_user_id?: string;
  title?: string;
}): Promise<string> {
  if (args.owner_identity_id) {
    const existing = await db.query.chronosIdentities.findFirst({
      where: eq(chronosIdentities.id, args.owner_identity_id),
    });
    if (!existing) throw new Error("owner_identity_id not found");
    return existing.id;
  }

  if (!args.chronos_user_id) {
    throw new Error("owner_identity_id or chronos_user_id required");
  }

  const chronosUserId = String(args.chronos_user_id);
  const existing = await db.query.chronosIdentities.findFirst({
    where: eq(chronosIdentities.chronosUserId, chronosUserId),
  });
  if (existing) return existing.id;

  const [row] = await db
    .insert(chronosIdentities)
    .values({
      chronosUserId,
      name: args.title ? `Chronos user` : undefined,
    })
    .returning();
  return row.id;
}

async function meetCreateRoom(args: {
  title: string;
  board_id?: string;
  owner_identity_id?: string;
  chronos_user_id?: string;
  slug?: string;
}) {
  const ownerIdentityId = await resolveOwnerIdentityId(args);
  const slug = args.slug || nanoid(10).toLowerCase();
  const [room] = await db
    .insert(rooms)
    .values({
      slug,
      title: args.title,
      ownerIdentityId,
      boardId: args.board_id,
      livekitRoomName: `meet_${slug}`,
      accessPolicy: "members",
    })
    .returning();
  const colors = BOARD_THEMES.indigo;
  await db.insert(roomBrands).values({
    roomId: room.id,
    themePreset: "indigo",
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: args.title,
    lobbyTitle: args.title,
  });
  return {
    room_id: room.id,
    slug: room.slug,
    url: `https://meet.chronos.com.pt/r/${room.slug}`,
  };
}

async function meetGetTranscript(args: { meeting_id?: string; room_slug?: string }) {
  let meetingId = args.meeting_id;
  if (!meetingId && args.room_slug) {
    const room = await db.query.rooms.findFirst({
      where: eq(rooms.slug, args.room_slug),
    });
    if (!room) throw new Error("room not found");
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.roomId, room.id),
    });
    meetingId = meeting?.id;
  }
  if (!meetingId) throw new Error("meeting_id or room_slug required");
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
  if (!authorize(req)) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" }, id: null },
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
              "Create a Chronos Meet room and return its join URL. Prefer chronos_user_id when calling from Chronos Organizador.",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string" },
                board_id: { type: "string" },
                owner_identity_id: { type: "string" },
                chronos_user_id: { type: "string" },
                slug: { type: "string" },
              },
              required: ["title"],
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
            title: z.string().min(1),
            board_id: z.string().optional(),
            owner_identity_id: z.string().uuid().optional(),
            chronos_user_id: z.string().min(1).optional(),
            slug: z.string().optional(),
          })
          .refine(
            (v) => Boolean(v.owner_identity_id || v.chronos_user_id),
            { message: "owner_identity_id or chronos_user_id required" },
          )
          .parse(args);
        result = await meetCreateRoom(parsed);
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
          content: [{ type: "text", text: e instanceof Error ? e.message : "error" }],
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "method not found" },
  });
}
