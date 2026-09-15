import { NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import { getOpsStats } from "@/ops/stats";

export async function GET() {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  try {
    const stats = await getOpsStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[ops/stats]", err);
    return NextResponse.json({ error: "stats_failed" }, { status: 500 });
  }
}
