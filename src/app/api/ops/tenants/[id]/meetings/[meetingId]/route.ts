import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import { jsonError, parseUuidParam } from "@/ops/meetings";
import { getTenantMeeting } from "@/ops/tenants";

type Ctx = { params: Promise<{ id: string; meetingId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const { id: rawId, meetingId: rawMid } = await ctx.params;
  const id = parseUuidParam(rawId);
  const meetingId = parseUuidParam(rawMid);
  if (!id || !meetingId) return jsonError("invalid_id", 400);

  const detail = await getTenantMeeting(id, meetingId);
  if (!detail) return jsonError("not_found", 404);

  return NextResponse.json(detail);
}
