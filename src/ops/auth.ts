import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSession } from "@/lib/session";

/**
 * Ops panel gate — any OpenMeet server admin
 * (DB role admin or ADMIN_EMAILS override).
 */
export async function requireOpsAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdmin(session)) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { session };
}
