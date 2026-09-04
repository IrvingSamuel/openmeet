import path from "path";

export const BRAND_ASSETS_ROOT = path.join(
  process.cwd(),
  "storage",
  "brand-assets",
);

/** Legacy location used before dynamic route serving. */
export const LEGACY_BRAND_ASSETS_ROOT = path.join(
  process.cwd(),
  "public",
  "brand-assets",
);

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;
const SAFE_ROOM_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeBrandAssetPath(roomId: string, filename: string): boolean {
  return SAFE_ROOM_ID.test(roomId) && SAFE_FILENAME.test(filename);
}

export function brandAssetDiskPaths(roomId: string, filename: string): string[] {
  return [
    path.join(BRAND_ASSETS_ROOT, roomId, filename),
    path.join(LEGACY_BRAND_ASSETS_ROOT, roomId, filename),
  ];
}

export function brandAssetPublicUrl(roomId: string, filename: string): string {
  return `/brand-assets/${roomId}/${filename}`;
}

export function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
