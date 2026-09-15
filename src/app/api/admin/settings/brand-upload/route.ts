import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { APP_SETTINGS_ROW_ID, appSettings } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import {
  ensureAppSettings,
  invalidateAppSettingsCache,
} from "@/lib/app-settings";
import {
  BRAND_ASSETS_ROOT,
  brandAssetPublicUrl,
} from "@/lib/brand-assets";
import { getSession } from "@/lib/session";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !isAdmin(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const kindRaw = String(form.get("kind") || "");
  if (kindRaw !== "logo" && kindRaw !== "favicon") {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const kind = kindRaw as "logo" | "favicon";

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }

  await ensureAppSettings();
  const dir = path.join(BRAND_ASSETS_ROOT, APP_SETTINGS_ROW_ID);
  await mkdir(dir, { recursive: true });

  const filename = `${kind}-${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const url = brandAssetPublicUrl(APP_SETTINGS_ROW_ID, filename);
  const patch =
    kind === "logo" ? { uiLogoUrl: url } : { uiFaviconUrl: url };

  await db
    .update(appSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(appSettings.id, APP_SETTINGS_ROW_ID));
  invalidateAppSettingsCache();

  return NextResponse.json({ url, kind });
}
