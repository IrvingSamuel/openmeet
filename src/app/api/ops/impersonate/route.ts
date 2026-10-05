import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsAdmin } from "@/ops/auth";
import { startImpersonation } from "@/ops/impersonate";
import { jsonError, parseUuidParam } from "@/ops/meetings";

const schema = z.object({
  userId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  if (auth.session.impersonatorIdentityId) {
    return jsonError("already_impersonating", 409);
  }

  const body = schema.parse(await req.json());
  const userId = parseUuidParam(body.userId);
  if (!userId) return jsonError("invalid_id", 400);

  if (userId === (auth.session.identityId || auth.session.userId)) {
    return jsonError("cannot_impersonate_self", 400);
  }

  const result = await startImpersonation(userId);
  if (!result.ok) {
    return jsonError(result.error, result.error === "user_not_found" ? 404 : 400);
  }

  return NextResponse.json({ ok: true, target: result.target });
}
