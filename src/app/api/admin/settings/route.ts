import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  APP_SETTINGS_ROW_ID,
  appSettings,
} from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import {
  ensureAppSettings,
  invalidateAppSettingsCache,
  maskSecret,
  resolveAiConfig,
  resolveRecordingConfig,
  shouldSkipSecretUpdate,
  webhookEventsOrDefault,
} from "@/lib/app-settings";
import { getSession } from "@/lib/session";

const webhookEventsSchema = z.object({
  transcript: z.boolean(),
  chat: z.boolean(),
  summary: z.boolean(),
  tasks: z.boolean(),
  recording: z.boolean().optional(),
});

const putSchema = z.object({
  locale: z.enum(["pt-BR", "en", "es", "fr", "de"]).optional(),
  deploymentMode: z.enum(["server", "platform"]).optional(),
  allowSignup: z.boolean().optional(),
  geminiApiKey: z.string().nullable().optional(),
  geminiModel: z.string().max(120).nullable().optional(),
  geminiSummaryModel: z.string().max(120).nullable().optional(),
  deepgramApiKey: z.string().nullable().optional(),
  webhookUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  webhookSecret: z.string().nullable().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookEvents: webhookEventsSchema.optional(),
  recordingEnabled: z.boolean().optional(),
  recordingEngine: z.enum(["egress", "browser"]).optional(),
  recordingControlMode: z.enum(["manual", "auto"]).optional(),
  recordingStorage: z.enum(["local", "s3"]).optional(),
  recordingS3Endpoint: z.string().max(500).nullable().optional(),
  recordingS3Bucket: z.string().max(200).nullable().optional(),
  recordingS3Region: z.string().max(80).nullable().optional(),
  recordingS3AccessKey: z.string().nullable().optional(),
  recordingS3SecretKey: z.string().nullable().optional(),
  uiPrimary: z.string().max(40).nullable().optional(),
  uiSecondary: z.string().max(40).nullable().optional(),
  uiTertiary: z.string().max(40).nullable().optional(),
  uiBackground: z.string().max(40).nullable().optional(),
  uiInk: z.string().max(40).nullable().optional(),
  uiWordmark: z.string().max(120).nullable().optional(),
  uiLogoUrl: z.string().max(500).nullable().optional(),
  uiFaviconUrl: z.string().max(500).nullable().optional(),
  uiFontFamily: z.string().max(200).nullable().optional(),
});

async function requireAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!isAdmin(session)) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}

function publicSettingsPayload(
  row: typeof appSettings.$inferSelect,
  ai: Awaited<ReturnType<typeof resolveAiConfig>>,
  recording: Awaited<ReturnType<typeof resolveRecordingConfig>>,
) {
  const events = webhookEventsOrDefault(row.webhookEvents);
  const geminiKeyMask = row.geminiApiKey?.trim()
    ? maskSecret(row.geminiApiKey)
    : {
        configured: Boolean(ai.geminiApiKey),
        preview: ai.geminiApiKey
          ? `••••${ai.geminiApiKey.slice(-4)}`
          : null,
        source: ai.sources.geminiApiKey,
      };
  const deepgramMask = row.deepgramApiKey?.trim()
    ? maskSecret(row.deepgramApiKey)
    : {
        configured: Boolean(ai.deepgramApiKey),
        preview: ai.deepgramApiKey
          ? `••••${ai.deepgramApiKey.slice(-4)}`
          : null,
        source: ai.sources.deepgramApiKey,
      };

  const s3AccessMask = row.recordingS3AccessKey?.trim()
    ? maskSecret(row.recordingS3AccessKey)
    : {
        configured: Boolean(recording.s3.accessKey),
        preview: recording.s3.accessKey
          ? `••••${recording.s3.accessKey.slice(-4)}`
          : null,
        source: recording.sources.s3AccessKey,
      };
  const s3SecretMask = row.recordingS3SecretKey?.trim()
    ? maskSecret(row.recordingS3SecretKey)
    : {
        configured: Boolean(recording.s3.secretKey),
        preview: recording.s3.secretKey
          ? `••••${recording.s3.secretKey.slice(-4)}`
          : null,
        source: recording.sources.s3SecretKey,
      };

  return {
    locale: row.locale || "pt-BR",
    deploymentMode: row.deploymentMode || "platform",
    allowSignup: row.allowSignup !== false,
    uiPrimary: row.uiPrimary || "#0ea5e9",
    uiSecondary: row.uiSecondary || "#38bdf8",
    uiTertiary: row.uiTertiary || "#818cf8",
    uiBackground: row.uiBackground || "#0b1020",
    uiInk: row.uiInk || "#f8fafc",
    uiWordmark: row.uiWordmark || "OpenMeet",
    uiLogoUrl: row.uiLogoUrl || "",
    uiFaviconUrl: row.uiFaviconUrl || "",
    uiFontFamily: row.uiFontFamily || "Inter, system-ui, sans-serif",
    geminiApiKey: geminiKeyMask,
    geminiModel: row.geminiModel || ai.geminiModel,
    geminiSummaryModel: row.geminiSummaryModel || ai.geminiSummaryModel,
    geminiModelSource: ai.sources.geminiModel,
    geminiSummaryModelSource: ai.sources.geminiSummaryModel,
    deepgramApiKey: deepgramMask,
    deepgramNote:
      "A chave Deepgram na UI fica guardada para referência; o worker Python do agente continua a ler DEEPGRAM_API_KEY do .env.",
    webhookEnabled: row.webhookEnabled,
    webhookUrl: row.webhookUrl || "",
    webhookSecret: row.webhookSecret?.trim()
      ? maskSecret(row.webhookSecret)
      : { configured: false, preview: null, source: "none" as const },
    webhookEvents: events,
    recordingEnabled: recording.enabled,
    recordingEngine: recording.engine,
    recordingControlMode: recording.controlMode,
    recordingStorage: recording.storage,
    recordingLocalDir: recording.localDir,
    recordingS3Endpoint: recording.s3.endpoint || "",
    recordingS3Bucket: recording.s3.bucket || "",
    recordingS3Region: recording.s3.region,
    recordingS3AccessKey: s3AccessMask,
    recordingS3SecretKey: s3SecretMask,
    recordingS3EndpointSource: recording.sources.s3Endpoint,
    recordingS3BucketSource: recording.sources.s3Bucket,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const row = await ensureAppSettings();
  const ai = await resolveAiConfig();
  const recording = await resolveRecordingConfig();
  return NextResponse.json(publicSettingsPayload(row, ai, recording));
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  await ensureAppSettings();

  const patch: Partial<typeof appSettings.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.locale !== undefined) patch.locale = body.locale;
  if (body.deploymentMode !== undefined) patch.deploymentMode = body.deploymentMode;
  if (body.allowSignup !== undefined) patch.allowSignup = body.allowSignup;

  if (body.uiPrimary !== undefined) patch.uiPrimary = body.uiPrimary?.trim() || null;
  if (body.uiSecondary !== undefined) patch.uiSecondary = body.uiSecondary?.trim() || null;
  if (body.uiTertiary !== undefined) patch.uiTertiary = body.uiTertiary?.trim() || null;
  if (body.uiBackground !== undefined) patch.uiBackground = body.uiBackground?.trim() || null;
  if (body.uiInk !== undefined) patch.uiInk = body.uiInk?.trim() || null;
  if (body.uiWordmark !== undefined) patch.uiWordmark = body.uiWordmark?.trim() || null;
  if (body.uiLogoUrl !== undefined) patch.uiLogoUrl = body.uiLogoUrl?.trim() || null;
  if (body.uiFaviconUrl !== undefined) patch.uiFaviconUrl = body.uiFaviconUrl?.trim() || null;
  if (body.uiFontFamily !== undefined) patch.uiFontFamily = body.uiFontFamily?.trim() || null;

  if (!shouldSkipSecretUpdate(body.geminiApiKey)) {
    patch.geminiApiKey = body.geminiApiKey!.trim() || null;
  } else if (body.geminiApiKey === null) {
    patch.geminiApiKey = null;
  }

  if (body.geminiModel !== undefined) {
    patch.geminiModel = body.geminiModel?.trim() || null;
  }
  if (body.geminiSummaryModel !== undefined) {
    patch.geminiSummaryModel = body.geminiSummaryModel?.trim() || null;
  }

  if (!shouldSkipSecretUpdate(body.deepgramApiKey)) {
    patch.deepgramApiKey = body.deepgramApiKey!.trim() || null;
  } else if (body.deepgramApiKey === null) {
    patch.deepgramApiKey = null;
  }

  if (body.webhookUrl !== undefined) {
    const url = body.webhookUrl?.trim() || "";
    patch.webhookUrl = url || null;
  }

  if (!shouldSkipSecretUpdate(body.webhookSecret)) {
    patch.webhookSecret = body.webhookSecret!.trim() || null;
  } else if (body.webhookSecret === null) {
    patch.webhookSecret = null;
  }

  if (body.webhookEnabled !== undefined) {
    patch.webhookEnabled = body.webhookEnabled;
  }
  if (body.webhookEvents !== undefined) {
    patch.webhookEvents = {
      transcript: body.webhookEvents.transcript,
      chat: body.webhookEvents.chat,
      summary: body.webhookEvents.summary,
      tasks: body.webhookEvents.tasks,
      recording: body.webhookEvents.recording ?? true,
    };
  }

  if (body.recordingEnabled !== undefined) {
    patch.recordingEnabled = body.recordingEnabled;
  }
  if (body.recordingEngine !== undefined) {
    patch.recordingEngine = body.recordingEngine;
  }
  if (body.recordingControlMode !== undefined) {
    patch.recordingControlMode = body.recordingControlMode;
  }
  if (body.recordingStorage !== undefined) {
    patch.recordingStorage = body.recordingStorage;
  }
  if (body.recordingS3Endpoint !== undefined) {
    patch.recordingS3Endpoint = body.recordingS3Endpoint?.trim() || null;
  }
  if (body.recordingS3Bucket !== undefined) {
    patch.recordingS3Bucket = body.recordingS3Bucket?.trim() || null;
  }
  if (body.recordingS3Region !== undefined) {
    patch.recordingS3Region = body.recordingS3Region?.trim() || null;
  }
  if (!shouldSkipSecretUpdate(body.recordingS3AccessKey)) {
    patch.recordingS3AccessKey = body.recordingS3AccessKey!.trim() || null;
  } else if (body.recordingS3AccessKey === null) {
    patch.recordingS3AccessKey = null;
  }
  if (!shouldSkipSecretUpdate(body.recordingS3SecretKey)) {
    patch.recordingS3SecretKey = body.recordingS3SecretKey!.trim() || null;
  } else if (body.recordingS3SecretKey === null) {
    patch.recordingS3SecretKey = null;
  }

  const [updated] = await db
    .update(appSettings)
    .set(patch)
    .where(eq(appSettings.id, APP_SETTINGS_ROW_ID))
    .returning();

  invalidateAppSettingsCache();

  const row = updated ?? (await ensureAppSettings());
  const ai = await resolveAiConfig();
  const recording = await resolveRecordingConfig();
  return NextResponse.json({
    ok: true,
    ...publicSettingsPayload(row, ai, recording),
  });
}
