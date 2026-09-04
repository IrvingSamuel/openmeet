import { NextResponse } from "next/server";
import { getSession, defaultSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  Object.assign(session, defaultSession);
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  Object.assign(session, defaultSession);
  await session.save();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is required" },
      { status: 500 },
    );
  }
  return NextResponse.redirect(`${appUrl}/`);
}
