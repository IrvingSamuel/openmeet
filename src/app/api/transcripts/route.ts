import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { transcriptSegments, meetings, participants } from "@/db/schema";
import { getSession } from "@/lib/session";
import { assertMeetingSummaryAccess } from "@/lib/meetingAccess";

const segmentSchema = z.object({
  meetingId: z.string().uuid(),
  speakerLabel: z.string(),
  text: z.string().min(1),
  isFinal: z.boolean().optional(),
  startedAtMs: z.number().optional(),
  endedAtMs: z.number().optional(),
  /** DB participant UUID when known */
  participantId: z.string().uuid().optional(),
  /** LiveKit identity — resolved to participants.id when participantId omitted */
  livekitIdentity: z.string().optional(),
  agentSecret: z.string().optional(),
});

function authorizeAgent(req: NextRequest, bodySecret?: string) {
  const expected = process.env.AGENT_SHARED_SECRET;
  if (!expected) return true;
  const header = req.headers.get("x-agent-secret");
  return header === expected || bodySecret === expected;
}

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }

  const session = await getSession();
  const access = await assertMeetingSummaryAccess({
    meetingId,
    session,
    allowEndedPublic: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const segments = await db.query.transcriptSegments.findMany({
    where: eq(transcriptSegments.meetingId, meetingId),
    orderBy: [asc(transcriptSegments.createdAt)],
  });
  return NextResponse.json({ segments });
}

export async function POST(req: NextRequest) {
  const body = segmentSchema.parse(await req.json());
  if (!authorizeAgent(req, body.agentSecret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, body.meetingId),
  });
  if (!meeting) return NextResponse.json({ error: "meeting_not_found" }, { status: 404 });

  let participantId = body.participantId ?? null;
  if (!participantId && body.livekitIdentity) {
    const row = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, body.meetingId),
        eq(participants.livekitIdentity, body.livekitIdentity),
      ),
    });
    participantId = row?.id ?? null;
  }

  const [segment] = await db
    .insert(transcriptSegments)
    .values({
      meetingId: body.meetingId,
      speakerLabel: body.speakerLabel,
      text: body.text,
      isFinal: body.isFinal ?? true,
      startedAtMs: body.startedAtMs,
      endedAtMs: body.endedAtMs,
      participantId,
    })
    .returning();

  return NextResponse.json({ segment }, { status: 201 });
}
