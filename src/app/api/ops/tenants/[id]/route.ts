import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsAdmin } from "@/ops/auth";
import { jsonError, parseUuidParam } from "@/ops/meetings";
import { getTenant, setTenantRole } from "@/ops/tenants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const { id: raw } = await ctx.params;
  const id = parseUuidParam(raw);
  if (!id) return jsonError("invalid_id", 400);

  const tenant = await getTenant(id);
  if (!tenant) return jsonError("not_found", 404);

  return NextResponse.json(tenant);
}

const patchSchema = z.object({
  role: z.enum(["admin", "user"]),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const { id: raw } = await ctx.params;
  const id = parseUuidParam(raw);
  if (!id) return jsonError("invalid_id", 400);

  const body = patchSchema.parse(await req.json());
  // Prevent demoting yourself while not impersonating.
  if (
    id === (auth.session.identityId || auth.session.userId) &&
    body.role !== "admin"
  ) {
    return jsonError("cannot_demote_self", 400);
  }

  const updated = await setTenantRole(id, body.role);
  if (!updated) return jsonError("not_found", 404);

  return NextResponse.json({ user: updated });
}
