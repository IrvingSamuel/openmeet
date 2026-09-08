import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import {
  publicOrigin,
  setHostEntryGrant,
  verifyHostEntryToken,
} from "@/lib/host-entry";

/**
 * GET /api/v1/meetings/{meeting_id}/enter?token=…&display_name=…
 * Browser entry for API-issued host links. Sets an httpOnly host-entry cookie
 * and redirects to /m/{slug}.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ meeting_id: string }> },
) {
  const { meeting_id: meetingId } = await ctx.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      meetingId,
    )
  ) {
    return NextResponse.json({ error: "invalid_meeting_id" }, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("token") || "";
  const displayName =
    req.nextUrl.searchParams.get("display_name")?.trim().slice(0, 80) ||
    undefined;

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (meeting.status === "ended") {
    return NextResponse.json({ error: "meeting_ended" }, { status: 410 });
  }
  if (!verifyHostEntryToken(token, meeting.hostEntryTokenHash)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 403 });
  }

  await setHostEntryGrant({
    meetingId: meeting.id,
    displayName,
  });

  const locale =
    req.cookies.get("NEXT_LOCALE")?.value ||
    process.env.NEXT_PUBLIC_DEFAULT_LOCALE ||
    "pt";
  // Prefer NEXT_PUBLIC_APP_URL — req.nextUrl.origin is often localhost:3332
  // when Next listens on 127.0.0.1 behind nginx/Cloudflare.
  const dest = new URL(`/${locale}/m/${meeting.slug}`, publicOrigin());
  return NextResponse.redirect(dest, 302);
}
