import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createMeetingWithBrand } from "@/lib/meetings";
import { assertCanCreateMeeting } from "@/lib/deployment-mode";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  boardId: z.string().optional(),
  accessPolicy: z.enum(["public", "members", "invite"]).optional(),
  roomId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  const gate = await assertCanCreateMeeting(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: z.infer<typeof schema> = {};
  try {
    const raw = await req.json();
    body = schema.parse(raw ?? {});
  } catch {
    body = {};
  }

  const title =
    body.title?.trim() ||
    `Instant ${new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

  const { meeting, url, joinPath } = await createMeetingWithBrand({
    title,
    ownerIdentityId: session.identityId!,
    boardId: body.boardId,
    accessPolicy: body.accessPolicy || "public",
    roomId: body.roomId ?? null,
    useIdentityBrand: true,
  });

  return NextResponse.json(
    {
      meeting,
      meeting_id: meeting.id,
      slug: meeting.slug,
      url,
      join_path: joinPath,
    },
    { status: 201 },
  );
}
