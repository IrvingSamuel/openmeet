import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants, rooms } from "@/db/schema";
import { getWebhookReceiver } from "@/lib/livekit";
import { generateMeetingSummary } from "@/lib/meeting-summary";
import { dispatchMeetingEndedWebhooks } from "@/lib/outbound-webhooks";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const auth = req.headers.get("Authorization") || "";
  try {
    const receiver = getWebhookReceiver();
    const event = await receiver.receive(body, auth);

    if (event.event === "room_started" && event.room) {
      const room = await db.query.rooms.findFirst({
        where: eq(rooms.livekitRoomName, event.room.name),
      });
      if (room) {
        const active = await db.query.meetings.findFirst({
          where: (m, { and, eq: e }) => and(e(m.roomId, room.id), e(m.status, "active")),
        });
        if (active) {
          await db
            .update(meetings)
            .set({ livekitRoomSid: event.room.sid })
            .where(eq(meetings.id, active.id));
        } else {
          await db.insert(meetings).values({
            roomId: room.id,
            livekitRoomSid: event.room.sid,
            status: "active",
          });
        }
      }
    }

    if (event.event === "room_finished" && event.room) {
      const room = await db.query.rooms.findFirst({
        where: eq(rooms.livekitRoomName, event.room.name),
      });
      if (room) {
        const active = await db.query.meetings.findFirst({
          where: and(eq(meetings.roomId, room.id), eq(meetings.status, "active")),
        });
        await db
          .update(meetings)
          .set({ status: "ended", endedAt: new Date() })
          .where(and(eq(meetings.roomId, room.id), eq(meetings.status, "active")));

        if (active) {
          void dispatchMeetingEndedWebhooks(active.id).catch((err) => {
            console.error("[chronos-meet] meeting-ended webhooks failed", err);
          });
        }

        if (active && active.summaryStatus === "pending") {
          await db
            .update(meetings)
            .set({ summaryStatus: "running" })
            .where(
              and(
                eq(meetings.id, active.id),
                eq(meetings.summaryStatus, "pending"),
              ),
            );
          // Fire-and-forget — webhook must respond quickly
          void generateMeetingSummary(active.id).catch(async (err) => {
            console.error("[chronos-meet] webhook summary failed", err);
            await db
              .update(meetings)
              .set({ summaryStatus: "failed" })
              .where(eq(meetings.id, active.id));
          });
        }
      }
    }

    if (event.event === "participant_left" && event.participant) {
      await db
        .update(participants)
        .set({ leftAt: new Date() })
        .where(eq(participants.livekitIdentity, event.participant.identity));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("livekit webhook error", e);
    return NextResponse.json({ error: "invalid_webhook" }, { status: 401 });
  }
}
