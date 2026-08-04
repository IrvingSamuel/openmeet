import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatMessages, meetings } from "@/db/schema";
import { getSession } from "@/lib/session";

const postSchema = z.object({
  meetingId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  displayName: z.string().min(1).max(120),
  livekitIdentity: z.string().min(1).max(200),
});

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.meetingId, meetingId),
    orderBy: [asc(chatMessages.createdAt)],
    limit: 500,
  });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const body = postSchema.parse(await req.json());
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, body.meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Prefer logged-in users; allow guests already in the meeting room.
  if (!session.isLoggedIn && meeting.status !== "active") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [row] = await db
    .insert(chatMessages)
    .values({
      meetingId: body.meetingId,
      body: body.body.trim(),
      displayName: body.displayName.trim(),
      livekitIdentity: body.livekitIdentity,
    })
    .returning();

  return NextResponse.json({ message: row }, { status: 201 });
}
