import { NextRequest, NextResponse } from "next/server";
import { reconcileAndExpireMeetings } from "@/lib/meeting-lifecycle";

function authorizeInternal(req: NextRequest) {
  const expected =
    process.env.AGENT_SHARED_SECRET || process.env.MEET_MCP_TOKEN || "";
  if (!expected) return false;
  const header = req.headers.get("x-agent-secret");
  const auth = req.headers.get("authorization");
  return (
    header === expected ||
    auth === `Bearer ${expected}` ||
    auth === expected
  );
}

/** Cron-safe endpoint to expire stale meetings and reconcile with LiveKit. */
export async function POST(req: NextRequest) {
  if (!authorizeInternal(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await reconcileAndExpireMeetings();
  return NextResponse.json({ ok: true, ...result });
}
