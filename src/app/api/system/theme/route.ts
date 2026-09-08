import { NextResponse } from "next/server";
import { resolveSystemUiTheme } from "@/lib/system-theme";

export async function GET() {
  const theme = await resolveSystemUiTheme();
  return NextResponse.json({ theme });
}
