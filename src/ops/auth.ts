import { NextResponse } from "next/server";
import { isLocalRoot } from "@/lib/admin-auth";
import { getSession } from "@/lib/session";

/**
 * Ops panel gate — local root only (users.createdVia === "setup").
 * Granted admins and ADMIN_EMAILS overrides are rejected.
 */
export async function requireOpsAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!(await isLocalRoot(session))) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { session };
}
