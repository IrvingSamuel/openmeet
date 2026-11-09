import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  APP_SETTINGS_ROW_ID,
  appSettings,
  publicApiTokens,
} from "@/db/schema";
import {
  ensureAppSettings,
  invalidateAppSettingsCache,
  maskSecret,
} from "@/lib/app-settings";

export type PublicApiTokenRow = typeof publicApiTokens.$inferSelect;

export type PublicApiTokenPublic = {
  id: string;
  name: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  ownerIdentityId: string | null;
};

let legacyMigrated = false;

/** One-shot: move app_settings.public_api_token → public_api_tokens as "Chronos". */
export async function migrateLegacyPublicApiToken(): Promise<void> {
  if (legacyMigrated) return;

  try {
    const settings = await ensureAppSettings();
    const legacy = settings.publicApiToken?.trim() || "";
    if (!legacy) {
      legacyMigrated = true;
      return;
    }

    const existing = await db.query.publicApiTokens.findFirst({
      where: and(
        eq(publicApiTokens.token, legacy),
        isNull(publicApiTokens.revokedAt),
      ),
    });

    if (!existing) {
      const nameTaken = await db.query.publicApiTokens.findFirst({
        where: and(
          eq(publicApiTokens.name, "Chronos"),
          isNull(publicApiTokens.revokedAt),
        ),
      });
      const name = nameTaken ? "Chronos (legado)" : "Chronos";
      const preview = maskSecret(legacy).preview ?? `••••${legacy.slice(-4)}`;

      await db.insert(publicApiTokens).values({
        name,
        token: legacy,
        tokenPreview: preview,
        ownerIdentityId: settings.publicApiTokenOwnerId ?? null,
        createdAt: settings.publicApiTokenCreatedAt ?? new Date(),
      });
    }

    await db
      .update(appSettings)
      .set({
        publicApiToken: null,
        publicApiTokenCreatedAt: null,
        publicApiTokenOwnerId: null,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, APP_SETTINGS_ROW_ID));

    invalidateAppSettingsCache();
    legacyMigrated = true;
  } catch (err) {
    console.error("[openmeet] migrateLegacyPublicApiToken failed", err);
  }
}

/** Reset migration latch (tests). */
export function resetLegacyPublicApiTokenMigration() {
  legacyMigrated = false;
}

export function toPublicApiTokenPublic(
  row: PublicApiTokenRow,
): PublicApiTokenPublic {
  return {
    id: row.id,
    name: row.name,
    preview: row.tokenPreview,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    ownerIdentityId: row.ownerIdentityId ?? null,
  };
}

export async function listActivePublicApiTokens(): Promise<PublicApiTokenRow[]> {
  await migrateLegacyPublicApiToken();
  return db.query.publicApiTokens.findMany({
    where: isNull(publicApiTokens.revokedAt),
    orderBy: [desc(publicApiTokens.createdAt)],
  });
}

export async function findActiveTokenByName(
  name: string,
): Promise<PublicApiTokenRow | undefined> {
  await migrateLegacyPublicApiToken();
  return db.query.publicApiTokens.findFirst({
    where: and(
      eq(publicApiTokens.name, name),
      isNull(publicApiTokens.revokedAt),
    ),
  });
}

export async function touchPublicApiTokenLastUsed(id: string): Promise<void> {
  try {
    await db
      .update(publicApiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(publicApiTokens.id, id));
  } catch {
    // best-effort
  }
}
