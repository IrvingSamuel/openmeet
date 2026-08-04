import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ isLoggedIn: false });
  }
  return NextResponse.json({
    isLoggedIn: true,
    identityId: session.identityId,
    chronosUserId: session.chronosUserId,
    name: session.name,
    email: session.email,
    avatarUrl: session.avatarUrl,
    isAdmin: isAdmin(session),
  });
}
