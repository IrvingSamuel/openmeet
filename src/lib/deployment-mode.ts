import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appSettings,
  users,
  type DeploymentMode,
} from "@/db/schema";
import { ensureAppSettings, getAppSettings } from "@/lib/app-settings";
import type { SessionData } from "@/lib/session";
import { isAdmin } from "@/lib/admin-auth";

export async function getDeploymentMode(): Promise<DeploymentMode> {
  const fromEnv = process.env.DEPLOYMENT_MODE?.trim().toLowerCase();
  if (fromEnv === "server" || fromEnv === "platform") return fromEnv;
  const row = await getAppSettings();
  const mode = row?.deploymentMode?.trim().toLowerCase();
  if (mode === "server" || mode === "platform") return mode;
  return "platform";
}

export async function isSignupAllowed(): Promise<boolean> {
  const mode = await getDeploymentMode();
  if (mode === "server") return false;
  const env = process.env.ALLOW_SIGNUP?.trim().toLowerCase();
  if (env === "false" || env === "0") return false;
  if (env === "true" || env === "1") return true;
  const row = await getAppSettings();
  return row?.allowSignup !== false;
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return Number(row?.n ?? 0);
}

export async function needsSetup(): Promise<boolean> {
  return (await countUsers()) === 0;
}

export async function assertCanCreateMeeting(
  session: SessionData,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!session.isLoggedIn || !(session.userId || session.identityId)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const mode = await getDeploymentMode();
  if (mode === "server" && !isAdmin(session)) {
    return { ok: false, status: 403, error: "server_mode_admin_only" };
  }
  return { ok: true };
}

export async function setDeploymentMode(mode: DeploymentMode) {
  await ensureAppSettings();
  await db
    .update(appSettings)
    .set({ deploymentMode: mode, updatedAt: new Date() })
    .where(eq(appSettings.id, (await ensureAppSettings()).id));
}
