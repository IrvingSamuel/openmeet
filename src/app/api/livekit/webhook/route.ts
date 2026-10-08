import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { meetings, participants } from "@/db/schema";
import { meetingHostEverConnected } from "@/lib/hostAuth";
import { getWebhookReceiver } from "@/lib/livekit";
import { activateMeetingIfScheduled } from "@/lib/meeting-lifecycle";
import { generateMeetingSummary } from "@/lib/meeting-summary";
import { dispatchMeetingEndedWebhooks } from "@/lib/outbound-webhooks";
import {
  handleLiveStreamEgressWebhook,
  stopMeetingLiveStream,
} from "@/lib/live-stream";
import { handleEgressWebhook, stopMeetingRecording } from "@/lib/recording";

async function findMeetingByLivekitRoom(roomName: string) {
  return db.query.meetings.findFirst({
    where: eq(meetings.livekitRoomName, roomName),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const auth = req.headers.get("Authorization") || "";
  try {
    const receiver = getWebhookReceiver();
    const event = await receiver.receive(body, auth);

    if (event.event === "room_started" && event.room) {
      const meeting = await findMeetingByLivekitRoom(event.room.name);
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
        const endedAt = new Date();
        // Only guests came and went: keep the link usable. The next token
        // mint recreates the LiveKit room and reactivates the meeting.
        const hostJoined = await meetingHostEverConnected(meeting.id);
        const wasActive = hostJoined && meeting.status === "active";
        await db
          .update(meetings)
          .set(
            hostJoined
              ? { status: "ended", endedAt }
              : { status: "scheduled", livekitRoomSid: null },
          )
          .where(
            and(
              eq(meetings.id, meeting.id),
              inArray(meetings.status, ["active", "scheduled"]),
            ),
          );
        if (!hostJoined) {
          console.info(
            "[openmeet] room_finished before host joined; meeting %s kept open",
            meeting.id,
          );
        }

        // Close sessions that were still in the room at end.
        await db
          .update(participants)
          .set({ leftAt: endedAt })
          .where(
            and(
              eq(participants.meetingId, meeting.id),
              isNotNull(participants.connectedAt),
              isNull(participants.leftAt),
            ),
          );

        void stopMeetingRecording({
          meetingId: meeting.id,
          force: true,
        }).catch((err) => {
          console.error(
            "[openmeet] stop recording on room_finished",
            err,
          );
        });

        void stopMeetingLiveStream({ meetingId: meeting.id }).catch((err) => {
          console.error("[openmeet] stop live stream on room_finished", err);
        });

        // Never-started or host-less meetings skip webhooks/summary.
        if (wasActive) {
          void dispatchMeetingEndedWebhooks(meeting.id).catch((err) => {
            console.error("[openmeet] meeting-ended webhooks failed", err);
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
              console.error("[openmeet] webhook summary failed", err);
              await db
                .update(meetings)
                .set({ summaryStatus: "failed" })
                .where(eq(meetings.id, meeting.id));
            });
          }
        }
      }
    }

    if (
      event.event === "participant_joined" &&
      event.participant &&
      event.room
    ) {
      const meeting = await findMeetingByLivekitRoom(event.room.name);
      if (meeting) {
        const now = new Date();
        await db
          .update(participants)
          .set({ connectedAt: now })
          .where(
            and(
              eq(participants.meetingId, meeting.id),
              eq(participants.livekitIdentity, event.participant.identity),
              isNull(participants.connectedAt),
            ),
          );
      }
    }

    if (
      event.event === "participant_left" &&
      event.participant &&
      event.room
    ) {
      const meeting = await findMeetingByLivekitRoom(event.room.name);
      if (meeting) {
        await db
          .update(participants)
          .set({ leftAt: new Date() })
          .where(
            and(
              eq(participants.meetingId, meeting.id),
              eq(participants.livekitIdentity, event.participant.identity),
              isNull(participants.leftAt),
            ),
          );
      }
    }

    if (
      (event.event === "egress_started" ||
        event.event === "egress_updated" ||
        event.event === "egress_ended") &&
      event.egressInfo
    ) {
      const wasLiveStream = await handleLiveStreamEgressWebhook(
        event.egressInfo,
      );
      if (!wasLiveStream) await handleEgressWebhook(event.egressInfo);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("livekit webhook error", e);
    return NextResponse.json({ error: "invalid_webhook" }, { status: 401 });
  }
}
