import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  BRAND_ASSETS_ROOT,
  brandAssetPublicUrl,
} from "@/lib/brand-assets";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const kindRaw = String(form.get("kind") || "");
  if (kindRaw !== "logo" && kindRaw !== "pattern") {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const kind = kindRaw as "logo" | "pattern";

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

  const dir = path.join(BRAND_ASSETS_ROOT, session.identityId);
  await mkdir(dir, { recursive: true });

  const filename = `${kind}-${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const url = brandAssetPublicUrl(session.identityId, filename);
  return NextResponse.json({ url, kind });
}
