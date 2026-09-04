import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fillSessionFromUser } from "@/lib/auth-users";
import { countUsers, needsSetup } from "@/lib/deployment-mode";
import { assertPasswordStrength, hashPassword } from "@/lib/password";
import { getSession } from "@/lib/session";
import { ensureAppSettings } from "@/lib/app-settings";
import { APP_SETTINGS_ROW_ID, appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120).optional(),
  deploymentMode: z.enum(["server", "platform"]).optional(),
});

export async function GET() {
  const setup = await needsSetup();
  return NextResponse.json({ needsSetup: setup, userCount: await countUsers() });
}

export async function POST(req: NextRequest) {
  if (!(await needsSetup())) {
    return NextResponse.json({ error: "setup_already_done" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const strength = assertPasswordStrength(parsed.data.password);
  if (strength) {
    return NextResponse.json({ error: strength }, { status: 400 });
  }

  // Re-check under race
  if ((await countUsers()) > 0) {
    return NextResponse.json({ error: "setup_already_done" }, { status: 403 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      name: parsed.data.name?.trim() || "Admin",
      passwordHash,
      role: "admin",
      createdVia: "setup",
    })
    .returning();

  const mode = parsed.data.deploymentMode || process.env.DEPLOYMENT_MODE || "platform";
  const settings = await ensureAppSettings();
  await db
    .update(appSettings)
    .set({
      deploymentMode: mode === "server" ? "server" : "platform",
      allowSignup: mode !== "server",
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, settings.id || APP_SETTINGS_ROW_ID));

  const session = await getSession();
  await fillSessionFromUser(session, user);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    deploymentMode: mode === "server" ? "server" : "platform",
  });
}
