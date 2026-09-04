import { NextResponse } from "next/server";

/**
 * Legacy room join token. Meetings are independent — start a meeting from the
 * brand template via POST /api/rooms/[slug]/start and join at /m/{meetingSlug}.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "room_join_deprecated",
      hint: "POST /api/rooms/{slug}/start then join /m/{meetingSlug}",
    },
    { status: 410 },
  );
}
