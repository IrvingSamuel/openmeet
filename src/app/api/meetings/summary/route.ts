import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings, meetingSummaries, actionItems } from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  generateMeetingSummary,
  tryClaimSummary,
} from "@/lib/meeting-summary";
import { assertMeetingSummaryAccess } from "@/lib/meetingAccess";

const schema = z.object({
  meetingId: z.string().uuid(),
  force: z.boolean().optional(),
  agentSecret: z.string().optional(),
});

function authorizeAgent(req: NextRequest, bodySecret?: string) {
  const expected = process.env.AGENT_SHARED_SECRET;
  if (!expected) return false;
  const header = req.headers.get("x-agent-secret");
  return header === expected || bodySecret === expected;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const body = schema.parse(await req.json());
  const asAgent = authorizeAgent(req, body.agentSecret);
  if (!asAgent) {
    const access = await assertMeetingSummaryAccess({
      meetingId: body.meetingId,
      session,
      allowEndedPublic: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (body.force && !session.isLoggedIn) {
      return NextResponse.json({ error: "login_required" }, { status: 401 });
    }
  }

  let claim: "claimed" | "busy" | "ready";
  try {
    claim = await tryClaimSummary(body.meetingId, body.force);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (claim === "ready" || claim === "busy") {
    const summary = await db.query.meetingSummaries.findFirst({
      where: eq(meetingSummaries.meetingId, body.meetingId),
    });
    const items = await db.query.actionItems.findMany({
      where: eq(actionItems.meetingId, body.meetingId),
    });
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, body.meetingId),
    });
    return NextResponse.json({
      status: meeting?.summaryStatus ?? claim,
      summaryMarkdown: summary?.summaryMarkdown ?? null,
      actionItems: items,
    });
  }

  try {
    const result = await generateMeetingSummary(body.meetingId);
    return NextResponse.json({
      status: "ready",
      ...result,
    });
  } catch (err) {
    console.error("[openmeet] summary failed", err);
    await db
      .update(meetings)
      .set({ summaryStatus: "failed" })
      .where(eq(meetings.id, body.meetingId));
    return NextResponse.json({ error: "summary_failed" }, { status: 500 });
  }
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

  const summary = await db.query.meetingSummaries.findFirst({
    where: eq(meetingSummaries.meetingId, meetingId),
  });
  const items = await db.query.actionItems.findMany({
    where: eq(actionItems.meetingId, meetingId),
  });
  return NextResponse.json({
    status: access.meeting.summaryStatus ?? "pending",
    summary,
    actionItems: items,
    offline: summary?.model === "offline-fallback",
    billingDepleted:
      typeof summary?.summaryMarkdown === "string" &&
      (summary.summaryMarkdown.includes("limite de API atingido") ||
        summary.summaryMarkdown.includes("créditos Gemini esgotados")),
  });
}
