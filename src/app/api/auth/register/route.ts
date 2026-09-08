import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fillSessionFromUser, findUserByEmail } from "@/lib/auth-users";
import {
  isSignupAllowed,
  needsSetup,
} from "@/lib/deployment-mode";
import { assertPasswordStrength, hashPassword } from "@/lib/password";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120).optional(),
});

export async function POST(req: NextRequest) {
  if (await needsSetup()) {
    return NextResponse.json({ error: "setup_required" }, { status: 403 });
  }
  if (!(await isSignupAllowed())) {
    return NextResponse.json({ error: "signup_disabled" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const strength = assertPasswordStrength(parsed.data.password);
  if (strength) {
    return NextResponse.json({ error: strength }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await findUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      name: parsed.data.name?.trim() || email.split("@")[0],
      passwordHash,
      role: "user",
      createdVia: "local",
    })
    .returning();

  const session = await getSession();
  await fillSessionFromUser(session, user);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
