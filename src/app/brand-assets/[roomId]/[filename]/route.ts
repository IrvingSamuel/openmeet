import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import {
  brandAssetDiskPaths,
  isSafeBrandAssetPath,
  mimeFromFilename,
} from "@/lib/brand-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves uploaded brand logos/patterns from disk.
 * Next.js caches `public/` at process start, so runtime uploads must not
 * rely on static file serving — this route reads storage on every request.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ roomId: string; filename: string }> },
) {
  const { roomId, filename } = await ctx.params;
  if (!isSafeBrandAssetPath(roomId, filename)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const candidates = brandAssetDiskPaths(roomId, filename);
  const filePath = candidates.find((p) => existsSync(p));
  if (!filePath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": mimeFromFilename(filename),
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
