import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import { jsonError, opsEndMeeting, parseUuidParam } from "@/ops/meetings";

type Ctx = { params: Promise<{ id: string; meetingId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const { id: rawId, meetingId: rawMid } = await ctx.params;
  const id = parseUuidParam(rawId);
  const meetingId = parseUuidParam(rawMid);
  if (!id || !meetingId) return jsonError("invalid_id", 400);

  const result = await opsEndMeeting(id, meetingId);
  if (!result.ok) {
    return jsonError(result.error, result.error === "not_found" ? 404 : 400);
  }

  return NextResponse.json({
    ok: true,
    alreadyEnded: result.alreadyEnded,
  });
}
