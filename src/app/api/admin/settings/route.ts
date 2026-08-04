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
  shouldSkipSecretUpdate,
  webhookEventsOrDefault,
} from "@/lib/app-settings";
import { getSession } from "@/lib/session";

const webhookEventsSchema = z.object({
  transcript: z.boolean(),
  chat: z.boolean(),
  summary: z.boolean(),
  tasks: z.boolean(),
});

const putSchema = z.object({
  locale: z.enum(["pt-BR", "en", "es", "fr", "de"]).optional(),
  geminiApiKey: z.string().nullable().optional(),
  geminiModel: z.string().max(120).nullable().optional(),
  geminiSummaryModel: z.string().max(120).nullable().optional(),
  deepgramApiKey: z.string().nullable().optional(),
  webhookUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  webhookSecret: z.string().nullable().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookEvents: webhookEventsSchema.optional(),
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

  return {
    locale: row.locale || "pt-BR",
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
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const row = await ensureAppSettings();
  const ai = await resolveAiConfig();
  return NextResponse.json(publicSettingsPayload(row, ai));
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
    patch.webhookEvents = body.webhookEvents;
  }

  const [updated] = await db
    .update(appSettings)
    .set(patch)
    .where(eq(appSettings.id, APP_SETTINGS_ROW_ID))
    .returning();

  invalidateAppSettingsCache();

  const row = updated ?? (await ensureAppSettings());
  const ai = await resolveAiConfig();
  return NextResponse.json({
    ok: true,
    ...publicSettingsPayload(row, ai),
  });
}
