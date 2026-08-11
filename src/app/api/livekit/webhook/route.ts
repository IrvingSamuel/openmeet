import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";
import { getWebhookReceiver } from "@/lib/livekit";
import { activateMeetingIfScheduled } from "@/lib/meeting-lifecycle";
import { generateMeetingSummary } from "@/lib/meeting-summary";
import { dispatchMeetingEndedWebhooks } from "@/lib/outbound-webhooks";
import { handleEgressWebhook, stopMeetingRecording } from "@/lib/recording";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const auth = req.headers.get("Authorization") || "";
  try {
    const receiver = getWebhookReceiver();
    const event = await receiver.receive(body, auth);

    if (event.event === "room_started" && event.room) {
      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.livekitRoomName, event.room.name),
      });
      if (meeting) {
        await activateMeetingIfScheduled(meeting.id);
        await db
          .update(meetings)
          .set({ livekitRoomSid: event.room.sid })
          .where(eq(meetings.id, meeting.id));
      }
    }

    if (event.event === "room_finished" && event.room) {
      const meeting = await db.query.meetings.findFirst({
        where: and(
          eq(meetings.livekitRoomName, event.room.name),
          inArray(meetings.status, ["active", "scheduled"]),
        ),
      });
      if (meeting) {
        const wasActive = meeting.status === "active";
        await db
          .update(meetings)
          .set({ status: "ended", endedAt: new Date() })
          .where(eq(meetings.id, meeting.id));

        void stopMeetingRecording({
          meetingId: meeting.id,
          force: true,
        }).catch((err) => {
          console.error(
            "[chronos-meet] stop recording on room_finished",
            err,
          );
        });

        // Never-started (scheduled) meetings skip webhooks/summary.
        if (wasActive) {
          void dispatchMeetingEndedWebhooks(meeting.id).catch((err) => {
            console.error("[chronos-meet] meeting-ended webhooks failed", err);
          });

          if (meeting.summaryStatus === "pending") {
            await db
              .update(meetings)
              .set({ summaryStatus: "running" })
              .where(
                and(
                  eq(meetings.id, meeting.id),
                  eq(meetings.summaryStatus, "pending"),
                ),
              );
            void generateMeetingSummary(meeting.id).catch(async (err) => {
              console.error("[chronos-meet] webhook summary failed", err);
              await db
                .update(meetings)
                .set({ summaryStatus: "failed" })
                .where(eq(meetings.id, meeting.id));
            });
          }
        }
      }
    }

    if (event.event === "participant_left" && event.participant) {
      await db
        .update(participants)
        .set({ leftAt: new Date() })
        .where(eq(participants.livekitIdentity, event.participant.identity));
    }

    if (
      (event.event === "egress_started" ||
        event.event === "egress_updated" ||
        event.event === "egress_ended") &&
      event.egressInfo
    ) {
      await handleEgressWebhook(event.egressInfo);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("livekit webhook error", e);
    return NextResponse.json({ error: "invalid_webhook" }, { status: 401 });
  }
}
