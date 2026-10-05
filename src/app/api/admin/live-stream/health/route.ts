import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { checkEgressHealth } from "@/lib/live-stream";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await checkEgressHealth());
}
