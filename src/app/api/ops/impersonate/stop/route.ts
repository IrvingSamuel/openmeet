import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stopImpersonation } from "@/ops/impersonate";
import { jsonError } from "@/ops/meetings";

/**
 * Stop impersonation — allowed whenever impersonatorIdentityId is set
 * (current session may be a non-admin tenant view).
 */
export async function POST() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return jsonError("unauthorized", 401);
  }
  if (!session.impersonatorIdentityId) {
    return jsonError("not_impersonating", 400);
  }

  const result = await stopImpersonation();
  if (!result.ok) {
    return jsonError(result.error, 400);
  }

  return NextResponse.json({ ok: true, admin: result.admin });
}
