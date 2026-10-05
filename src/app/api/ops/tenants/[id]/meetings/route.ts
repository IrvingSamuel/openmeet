import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import { jsonError, parseUuidParam } from "@/ops/meetings";
import { listTenantMeetings } from "@/ops/tenants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const { id: raw } = await ctx.params;
  const id = parseUuidParam(raw);
  if (!id) return jsonError("invalid_id", 400);

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 100;
  const meetings = await listTenantMeetings(
    id,
    Number.isFinite(limit) ? limit : 100,
  );
  return NextResponse.json({ meetings });
}
