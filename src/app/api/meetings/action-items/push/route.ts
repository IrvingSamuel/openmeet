import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

const schema = z.object({
  meetingId: z.string().uuid(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        boardId: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * Chronos board push was removed in OpenMeet.
 * Use outbound webhooks (tasks.generated) to integrate with external tools.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, body.data.meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      error: "external_task_push_unavailable",
      message:
        "OpenMeet does not push tasks to an external board. Enable outbound webhooks for tasks.generated instead.",
    },
    { status: 501 },
  );
}
