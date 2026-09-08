import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fillSessionFromUser, findUserByEmail } from "@/lib/auth-users";
import { verifyPassword } from "@/lib/password";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { getSession } from "@/lib/session";
import { needsSetup } from "@/lib/deployment-mode";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  returnTo: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (await needsSetup()) {
    return NextResponse.json({ error: "setup_required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const session = await getSession();
  await fillSessionFromUser(session, user);

  const returnTo = sanitizeReturnTo(parsed.data.returnTo) || "/dashboard";
  return NextResponse.json({
    ok: true,
    returnTo,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}
