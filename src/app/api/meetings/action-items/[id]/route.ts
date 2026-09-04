import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { actionItems } from "@/db/schema";
import { getSession } from "@/lib/session";
import { assertMeetingSummaryAccess } from "@/lib/meetingAccess";

const patchSchema = z.object({
  status: z.enum(["pending", "done"]),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const item = await db.query.actionItems.findFirst({
    where: eq(actionItems.id, id),
  });
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await assertMeetingSummaryAccess({
    meetingId: item.meetingId,
    session,
    allowEndedPublic: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [updated] = await db
    .update(actionItems)
    .set({ status: parsed.data.status })
    .where(eq(actionItems.id, id))
    .returning();

  return NextResponse.json({ item: updated });
}
