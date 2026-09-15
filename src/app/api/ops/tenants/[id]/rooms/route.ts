import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import { jsonError, parseUuidParam } from "@/ops/meetings";
import { listTenantRooms } from "@/ops/tenants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const { id: raw } = await ctx.params;
  const id = parseUuidParam(raw);
  if (!id) return jsonError("invalid_id", 400);

  const rooms = await listTenantRooms(id);
  return NextResponse.json({ rooms });
}
