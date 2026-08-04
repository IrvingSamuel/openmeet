import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms, meetings } from "@/db/schema";

/** Export latest meeting for a room as ICS (VEVENT). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const room = await db.query.rooms.findFirst({ where: eq(rooms.slug, slug) });
  if (!room) return new NextResponse("Not found", { status: 404 });

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.roomId, room.id),
  });

  const dtStart = (meeting?.startedAt || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dtEnd = (meeting?.endedAt || new Date(Date.now() + 3600000))
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const uid = `${room.slug}@meet.chronos.com.pt`;
  const url = `https://meet.chronos.com.pt/r/${room.slug}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chronos Meet//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStart}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${room.title}`,
    `DESCRIPTION:Entrar: ${url}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${room.slug}.ics"`,
    },
  });
}
