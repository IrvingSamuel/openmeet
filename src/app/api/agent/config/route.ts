import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { resolveAiConfig } from "@/lib/app-settings";
import { featuresFromRow } from "@/lib/meeting-features";

function authorizeAgent(req: NextRequest): boolean {
  const expected = process.env.AGENT_SHARED_SECRET;
  if (!expected) return true;
  const header = req.headers.get("x-agent-secret");
  return header === expected;
}

/**
 * GET /api/agent/config[?room=<livekitRoomName>]
 * Resolved runtime secrets for the Python LiveKit agent (DB → env).
 * With `room`, also returns the meeting id and its AI feature flags
 * (`meetingId: null` and all features on when the meeting is unknown).
 * Auth: x-agent-secret === AGENT_SHARED_SECRET
 */
export async function GET(req: NextRequest) {
  if (!authorizeAgent(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ai = await resolveAiConfig();
  const base = {
    deepgramApiKey: ai.deepgramApiKey ?? null,
    deepgramSource: ai.sources.deepgramApiKey,
  };

  const room = req.nextUrl.searchParams.get("room")?.trim();
  if (!room) return NextResponse.json(base);

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.livekitRoomName, room),
    orderBy: [desc(meetings.startedAt)],
    columns: {
      id: true,
      captionsEnabled: true,
      transcriptionEnabled: true,
      summaryEnabled: true,
    },
  });

  return NextResponse.json({
    ...base,
    meetingId: meeting?.id ?? null,
    features: featuresFromRow(meeting ?? {}),
  });
}
