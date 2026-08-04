import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  APP_SETTINGS_ROW_ID,
  DEFAULT_WEBHOOK_EVENTS,
  appSettings,
  type RecordingControlMode,
  type RecordingEngine,
  type RecordingStorageBackend,
  type WebhookEventsConfig,
} from "@/db/schema";

export type AppSettingsRow = typeof appSettings.$inferSelect;

export type ResolvedAiConfig = {
  geminiApiKey: string | undefined;
  geminiModel: string;
  geminiSummaryModel: string;
  deepgramApiKey: string | undefined;
  /** True when the value comes from DB override rather than env. */
  sources: {
    geminiApiKey: "db" | "env" | "none";
    geminiModel: "db" | "env" | "default";
    geminiSummaryModel: "db" | "env" | "default";
    deepgramApiKey: "db" | "env" | "none";
  };
};

export type ResolvedRecordingConfig = {
  enabled: boolean;
  engine: RecordingEngine;
  controlMode: RecordingControlMode;
  storage: RecordingStorageBackend;
  localDir: string;
  s3: {
    endpoint: string | undefined;
    bucket: string | undefined;
    region: string;
    accessKey: string | undefined;
    secretKey: string | undefined;
  };
  sources: {
    s3AccessKey: "db" | "env" | "none";
    s3SecretKey: "db" | "env" | "none";
    s3Bucket: "db" | "env" | "none";
    s3Endpoint: "db" | "env" | "none";
  };
};

const CACHE_TTL_MS = 5_000;
let cache: { at: number; row: AppSettingsRow | null } | null = null;

export function invalidateAppSettingsCache() {
  cache = null;
}

export async function getAppSettings(): Promise<AppSettingsRow | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.row;
  }
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.id, APP_SETTINGS_ROW_ID),
    });
    cache = { at: now, row: row ?? null };
    return row ?? null;
  } catch (err) {
    console.error("[chronos-meet] getAppSettings failed; using env fallbacks", err);
    return null;
  }
}

/** Ensure the singleton row exists; returns it. */
export async function ensureAppSettings(): Promise<AppSettingsRow> {
  const existing = await getAppSettings();
  if (existing) return existing;

  const [inserted] = await db
    .insert(appSettings)
    .values({
      id: APP_SETTINGS_ROW_ID,
      locale: "pt-BR",
      webhookEnabled: false,
      webhookEvents: DEFAULT_WEBHOOK_EVENTS,
      recordingEnabled: false,
      recordingEngine: "browser",
      recordingControlMode: "manual",
      recordingStorage: "local",
    })
    .onConflictDoNothing()
    .returning();

  invalidateAppSettingsCache();
  if (inserted) return inserted;

  const again = await getAppSettings();
  if (!again) {
    throw new Error("failed_to_ensure_app_settings");
  }
  return again;
}

export function webhookEventsOrDefault(
  events: WebhookEventsConfig | null | undefined,
): WebhookEventsConfig {
  return {
    transcript: events?.transcript ?? DEFAULT_WEBHOOK_EVENTS.transcript,
    chat: events?.chat ?? DEFAULT_WEBHOOK_EVENTS.chat,
    summary: events?.summary ?? DEFAULT_WEBHOOK_EVENTS.summary,
    tasks: events?.tasks ?? DEFAULT_WEBHOOK_EVENTS.tasks,
    recording: events?.recording ?? DEFAULT_WEBHOOK_EVENTS.recording,
  };
}

export async function resolveLocale(): Promise<string> {
  const row = await getAppSettings();
  return row?.locale?.trim() || "pt-BR";
}

/** Human label for LLM prompts. */
export function localePromptLabel(locale: string): string {
  const map: Record<string, string> = {
    "pt-BR": "português (pt-BR)",
    pt: "português",
    en: "English",
    es: "español",
    fr: "français",
    de: "Deutsch",
  };
  return map[locale] || locale;
}

export async function resolveAiConfig(): Promise<ResolvedAiConfig> {
  const row = await getAppSettings();

  const geminiApiKeyDb = row?.geminiApiKey?.trim() || "";
  const geminiModelDb = row?.geminiModel?.trim() || "";
  const geminiSummaryModelDb = row?.geminiSummaryModel?.trim() || "";
  const deepgramApiKeyDb = row?.deepgramApiKey?.trim() || "";

  const envGeminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const envGeminiModel = process.env.GEMINI_MODEL?.trim() || "";
  const envSummaryModel = process.env.GEMINI_SUMMARY_MODEL?.trim() || "";
  const envDeepgram = process.env.DEEPGRAM_API_KEY?.trim() || "";

  const geminiApiKey = geminiApiKeyDb || envGeminiKey || undefined;
  const geminiModel =
    geminiModelDb || envGeminiModel || "gemini-3.5-flash-lite";
  const geminiSummaryModel =
    geminiSummaryModelDb ||
    envSummaryModel ||
    geminiModelDb ||
    envGeminiModel ||
    "gemini-3.5-flash-lite";
  const deepgramApiKey = deepgramApiKeyDb || envDeepgram || undefined;

  return {
    geminiApiKey,
    geminiModel,
    geminiSummaryModel,
    deepgramApiKey,
    sources: {
      geminiApiKey: geminiApiKeyDb
        ? "db"
        : envGeminiKey
          ? "env"
          : "none",
      geminiModel: geminiModelDb ? "db" : envGeminiModel ? "env" : "default",
      geminiSummaryModel: geminiSummaryModelDb
        ? "db"
        : envSummaryModel
          ? "env"
          : "default",
      deepgramApiKey: deepgramApiKeyDb
        ? "db"
        : envDeepgram
          ? "env"
          : "none",
    },
  };
}

function asEngine(value: string | null | undefined): RecordingEngine {
  return value === "egress" ? "egress" : "browser";
}

function asControlMode(value: string | null | undefined): RecordingControlMode {
  return value === "auto" ? "auto" : "manual";
}

function asStorage(value: string | null | undefined): RecordingStorageBackend {
  return value === "s3" ? "s3" : "local";
}

export async function resolveRecordingConfig(): Promise<ResolvedRecordingConfig> {
  const row = await getAppSettings();

  const endpointDb = row?.recordingS3Endpoint?.trim() || "";
  const bucketDb = row?.recordingS3Bucket?.trim() || "";
  const regionDb = row?.recordingS3Region?.trim() || "";
  const accessDb = row?.recordingS3AccessKey?.trim() || "";
  const secretDb = row?.recordingS3SecretKey?.trim() || "";

  const endpointEnv = process.env.RECORDING_S3_ENDPOINT?.trim() || "";
  const bucketEnv = process.env.RECORDING_S3_BUCKET?.trim() || "";
  const regionEnv = process.env.RECORDING_S3_REGION?.trim() || "";
  const accessEnv = process.env.RECORDING_S3_ACCESS_KEY?.trim() || "";
  const secretEnv = process.env.RECORDING_S3_SECRET_KEY?.trim() || "";

  return {
    enabled: Boolean(row?.recordingEnabled),
    engine: asEngine(row?.recordingEngine),
    controlMode: asControlMode(row?.recordingControlMode),
    storage: asStorage(row?.recordingStorage),
    localDir:
      process.env.RECORDINGS_DIR?.trim() || "/var/chronos-meet/recordings",
    s3: {
      endpoint: endpointDb || endpointEnv || undefined,
      bucket: bucketDb || bucketEnv || undefined,
      region: regionDb || regionEnv || "us-east-1",
      accessKey: accessDb || accessEnv || undefined,
      secretKey: secretDb || secretEnv || undefined,
    },
    sources: {
      s3AccessKey: accessDb ? "db" : accessEnv ? "env" : "none",
      s3SecretKey: secretDb ? "db" : secretEnv ? "env" : "none",
      s3Bucket: bucketDb ? "db" : bucketEnv ? "env" : "none",
      s3Endpoint: endpointDb ? "db" : endpointEnv ? "env" : "none",
    },
  };
}

/** Mask a secret for API responses — never return the full value. */
export function maskSecret(value: string | null | undefined): {
  configured: boolean;
  preview: string | null;
  source: "db" | "env" | "none";
} {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return { configured: false, preview: null, source: "none" };
  }
  const last4 = trimmed.slice(-4);
  return {
    configured: true,
    preview: `••••${last4}`,
    source: "db",
  };
}

/** True when the client sent a masked placeholder or empty (do not overwrite). */
export function shouldSkipSecretUpdate(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return true;
  const v = value.trim();
  if (!v) return true;
  if (v.startsWith("••••")) return true;
  return false;
}
