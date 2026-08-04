import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms, meetings, participants, joinRequests } from "@/db/schema";
import { resolveRecordingConfig } from "@/lib/app-settings";
import { getSession } from "@/lib/session";
import { mintRoomToken, syncRoomMetadata } from "@/lib/livekit";
import { startMeetingRecording } from "@/lib/recording";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const session = await getSession();
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    /** @deprecated Ignored — only the room owner becomes host. */
    asHost?: boolean;
    /** Per-tab id so two browsers don't kick each other (DUPLICATE_IDENTITY). */
    clientInstanceId?: string;
    /** Approved waiting-room request id (invite policy). */
    requestId?: string;
  };

  const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOwner =
    Boolean(session.identityId) && session.identityId === room.ownerIdentityId;
  if (room.accessPolicy === "members" && !session.isLoggedIn) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const displayName =
    body.displayName ||
    session.name ||
    session.email ||
    `Guest-${Date.now() % 10000}`;
  const role = isOwner ? "host" : "participant";
  const instance =
    typeof body.clientInstanceId === "string" && body.clientInstanceId.length > 0
      ? body.clientInstanceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)
      : Math.random().toString(36).slice(2, 10);

  // Invite-only: non-owners wait for host approval before receiving a token.
  if (room.accessPolicy === "invite" && !isOwner) {
    if (body.requestId) {
      const existing = await db.query.joinRequests.findFirst({
        where: and(
          eq(joinRequests.id, body.requestId),
          eq(joinRequests.roomId, room.id),
        ),
      });
      if (!existing) {
        return NextResponse.json({ error: "request_not_found" }, { status: 404 });
      }
      if (existing.clientInstanceId !== instance) {
        return NextResponse.json({ error: "request_mismatch" }, { status: 403 });
      }
      if (existing.status === "denied") {
        return NextResponse.json({ error: "denied", status: "denied" }, { status: 403 });
      }
      if (existing.status === "cancelled") {
        return NextResponse.json(
          { error: "cancelled", status: "cancelled" },
          { status: 403 },
        );
      }
      if (existing.status === "consumed") {
        return NextResponse.json(
          { error: "request_already_used", status: "consumed" },
          { status: 409 },
        );
      }
      if (existing.status === "pending") {
        return NextResponse.json({
          status: "pending",
          requestId: existing.id,
        });
      }
      if (existing.status === "approved") {
        const consumed = await db
          .update(joinRequests)
          .set({ status: "consumed", resolvedAt: new Date() })
          .where(
            and(
              eq(joinRequests.id, existing.id),
              eq(joinRequests.status, "approved"),
            ),
          )
          .returning();
        if (consumed.length === 0) {
          return NextResponse.json(
            { error: "request_already_used", status: "consumed" },
            { status: 409 },
          );
        }
      } else {
        return NextResponse.json(
          { error: "invalid_request_status", status: existing.status },
          { status: 400 },
        );
      }
    } else {
      const pending = await db.query.joinRequests.findFirst({
        where: and(
          eq(joinRequests.roomId, room.id),
          eq(joinRequests.clientInstanceId, instance),
          eq(joinRequests.status, "pending"),
        ),
      });
      if (pending) {
        await db
          .update(joinRequests)
          .set({ displayName, identityId: session.identityId ?? null })
          .where(eq(joinRequests.id, pending.id));
        return NextResponse.json({
          status: "pending",
          requestId: pending.id,
        });
      }
      const [created] = await db
        .insert(joinRequests)
        .values({
          roomId: room.id,
          displayName,
          identityId: session.identityId ?? null,
          clientInstanceId: instance,
          status: "pending",
        })
        .returning();
      return NextResponse.json({
        status: "pending",
        requestId: created.id,
      });
    }
  }

  const livekitIdentity = session.identityId
    ? `user_${session.identityId}_${instance}`
    : `guest_${instance}`;

  const active = await db.query.meetings.findFirst({
    where: (m, { and: a, eq: e }) =>
      a(e(m.roomId, room.id), e(m.status, "active")),
  });
  let meeting = active;
  if (!active) {
    const [created] = await db
      .insert(meetings)
      .values({ roomId: room.id, status: "active" })
      .returning();
    meeting = created;
  }

  await db.insert(participants).values({
    meetingId: meeting!.id,
    identityId: session.identityId,
    displayName,
    role,
    livekitIdentity,
  });

  try {
    await syncRoomMetadata(room.livekitRoomName, {
      meetingId: meeting!.id,
      roomId: room.id,
      slug: room.slug,
      boardId: room.boardId,
    });
  } catch (err) {
    console.error("[chronos-meet] syncRoomMetadata failed", err);
  }

  const token = await mintRoomToken({
    roomName: room.livekitRoomName,
    identity: livekitIdentity,
    name: displayName,
    role,
  });

  const recordingConfig = await resolveRecordingConfig();
  let autoRecordingId: string | null = null;
  if (
    role === "host" &&
    recordingConfig.enabled &&
    recordingConfig.controlMode === "auto" &&
    recordingConfig.engine === "egress"
  ) {
    const started = await startMeetingRecording({
      meetingId: meeting!.id,
      allowAuto: true,
    });
    if (started.ok) {
      autoRecordingId = started.recording.id;
    } else {
      console.warn("[chronos-meet] auto recording start failed", started.error);
    }
  }

  return NextResponse.json({
    token,
    serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL,
    room: {
      id: room.id,
      slug: room.slug,
      title: room.title,
      livekitRoomName: room.livekitRoomName,
    },
    meetingId: meeting!.id,
    role,
    identity: livekitIdentity,
    status: "ready",
    recording: {
      enabled: recordingConfig.enabled,
      engine: recordingConfig.engine,
      controlMode: recordingConfig.controlMode,
      autoRecordingId,
    },
  });
}
