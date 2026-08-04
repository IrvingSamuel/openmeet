import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import {
  listCopilotChatMessages,
  sendCopilotChatMessage,
} from "@/lib/copilot-chat";
import { getSession } from "@/lib/session";

const postSchema = z.object({
  meetingId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  displayName: z.string().trim().min(1).max(120),
  livekitIdentity: z.string().trim().min(1).max(200),
  source: z.enum(["text", "voice"]).optional(),
  agentSecret: z.string().optional(),
});

function authorizeAgent(req: NextRequest, bodySecret?: string) {
  const expected = process.env.AGENT_SHARED_SECRET;
  if (!expected) return false;
  const header = req.headers.get("x-agent-secret");
  return header === expected || bodySecret === expected;
}

async function authorizeMeetingAccess(
  req: NextRequest,
  meetingId: string,
  agentSecret?: string,
) {
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) return { ok: false as const, status: 404 };

  if (authorizeAgent(req, agentSecret)) {
    return { ok: true as const, meeting };
  }

  const session = await getSession();
  if (session.isLoggedIn || meeting.status === "active") {
    return { ok: true as const, meeting };
  }
  return { ok: false as const, status: 403 };
}

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }

  const auth = await authorizeMeetingAccess(req, meetingId);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "not_found" : "forbidden" },
      { status: auth.status },
    );
  }

  const messages = await listCopilotChatMessages(meetingId);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const body = postSchema.parse(await req.json());
  const auth = await authorizeMeetingAccess(
    req,
    body.meetingId,
    body.agentSecret,
  );
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "not_found" : "forbidden" },
      { status: auth.status },
    );
  }

  try {
    const result = await sendCopilotChatMessage({
      meetingId: body.meetingId,
      message: body.message,
      displayName: body.displayName,
      livekitIdentity: body.livekitIdentity,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "chat_quota"
    ) {
      return NextResponse.json(
        {
          error: "chat_quota",
          message: err instanceof Error ? err.message : "Quota exceeded",
        },
        { status: 429 },
      );
    }
    throw err;
  }
}
