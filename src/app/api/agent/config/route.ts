import { NextRequest, NextResponse } from "next/server";
import { resolveAiConfig } from "@/lib/app-settings";

function authorizeAgent(req: NextRequest): boolean {
  const expected = process.env.AGENT_SHARED_SECRET;
  if (!expected) return true;
  const header = req.headers.get("x-agent-secret");
  return header === expected;
}

/**
 * GET /api/agent/config
 * Resolved runtime secrets for the Python LiveKit agent (DB → env).
 * Auth: x-agent-secret === AGENT_SHARED_SECRET
 */
export async function GET(req: NextRequest) {
  if (!authorizeAgent(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ai = await resolveAiConfig();
  return NextResponse.json({
    deepgramApiKey: ai.deepgramApiKey ?? null,
    deepgramSource: ai.sources.deepgramApiKey,
  });
}
