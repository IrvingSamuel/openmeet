import { NextResponse } from "next/server";

/** Chronos boards API removed — return empty list for legacy summary UI. */
export async function GET() {
  return NextResponse.json({ boards: [], board: null });
}
