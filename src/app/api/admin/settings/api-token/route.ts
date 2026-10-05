import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_SETTINGS_ROW_ID, appSettings } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import {
  ensureAppSettings,
  invalidateAppSettingsCache,
  maskSecret,
} from "@/lib/app-settings";
import { getSession, sessionUserId } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const ownerId = sessionUserId(session);
  if (!isAdmin(session) || !ownerId) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { session, ownerId };
}

/** POST — generate or rotate the public API Bearer token (shown once). */
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  await ensureAppSettings();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();

  await db
    .update(appSettings)
    .set({
      publicApiToken: token,
      publicApiTokenCreatedAt: now,
      publicApiTokenOwnerId: auth.ownerId,
      updatedAt: now,
    })
    .where(eq(appSettings.id, APP_SETTINGS_ROW_ID));

  invalidateAppSettingsCache();

  return NextResponse.json({
    token,
    preview: maskSecret(token).preview,
    created_at: now.toISOString(),
    owner_identity_id: auth.ownerId,
    warning:
      "Guarde este token agora — não será mostrado novamente na íntegra.",
  });
}

/** DELETE — revoke the public API token. */
export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  await ensureAppSettings();
  const now = new Date();

  await db
    .update(appSettings)
    .set({
      publicApiToken: null,
      publicApiTokenCreatedAt: null,
      publicApiTokenOwnerId: null,
      updatedAt: now,
    })
    .where(eq(appSettings.id, APP_SETTINGS_ROW_ID));

  invalidateAppSettingsCache();

  return NextResponse.json({ revoked: true });
}
