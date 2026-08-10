import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { rm } from "fs/promises";
import path from "path";
import { db } from "@/db";
import {
  chronosIdentities,
  identityBrands,
  roomBrands,
  rooms,
  type RoomKind,
} from "@/db/schema";
import { BOARD_THEMES } from "@/lib/brand";
import {
  brandFieldsToPatch,
  type BrandFieldsInput,
} from "@/lib/brand-schema";
import {
  BRAND_ASSETS_ROOT,
  LEGACY_BRAND_ASSETS_ROOT,
} from "@/lib/brand-assets";
import { getRoomServiceClient } from "@/lib/livekit";

export type CreateRoomInput = {
  title: string;
  ownerIdentityId: string;
  slug?: string;
  boardId?: string | null;
  accessPolicy?: "public" | "members" | "invite";
  kind?: RoomKind;
  themePreset?: string;
  /** Full UI override (API). When set, wins over identity default / themePreset. */
  ui?: BrandFieldsInput;
  /** When true (default), seed from identity_brands if no `ui` provided. */
  useIdentityBrand?: boolean;
};

export type CreatedRoomResult = {
  room: typeof rooms.$inferSelect;
  brand: typeof roomBrands.$inferSelect;
  url: string;
  joinPath: string;
};

function publicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://meet.chronos.com.pt"
  );
}

export function roomJoinUrl(slug: string): { url: string; joinPath: string } {
  const joinPath = `/r/${slug}`;
  return { joinPath, url: `${publicOrigin()}${joinPath}` };
}

function defaultBrandValues(title: string, themePreset?: string) {
  const preset =
    themePreset && BOARD_THEMES[themePreset] ? themePreset : "violet";
  const colors = BOARD_THEMES[preset];
  return {
    themePreset: preset,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: title,
    lobbyTitle: title,
    lobbySubtitle: "Powered by Chronos Meet",
  };
}

function identityBrandToRoomValues(
  row: typeof identityBrands.$inferSelect,
  title: string,
): Record<string, unknown> {
  return {
    logoUrl: row.logoUrl,
    wordmark: row.wordmark || title,
    themePreset: row.themePreset || "violet",
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    tertiaryColor: row.tertiaryColor,
    fontFamily: row.fontFamily,
    background: row.background,
    lobbyTitle: row.lobbyTitle || title,
    lobbySubtitle: row.lobbySubtitle || "Powered by Chronos Meet",
    faviconUrl: row.faviconUrl,
    customCss: row.customCss,
    primaryPaint: row.primaryPaint,
    secondaryPaint: row.secondaryPaint,
    tertiaryPaint: row.tertiaryPaint,
    backgroundPaint: row.backgroundPaint,
    patternUrl: row.patternUrl,
    patternSizeMode: row.patternSizeMode,
    patternSize: row.patternSize,
    patternTint: row.patternTint,
    patternTintColor: row.patternTintColor,
    patternTintOpacity: row.patternTintOpacity,
    bgAnimation: row.bgAnimation,
    bgAnimationSpeed: row.bgAnimationSpeed,
  };
}

export async function createRoomWithBrand(
  input: CreateRoomInput,
): Promise<CreatedRoomResult> {
  const slug = (input.slug || nanoid(10)).toLowerCase();
  const kind = input.kind || "persistent";
  const accessPolicy =
    input.accessPolicy || (kind === "instant" ? "public" : "members");

  const [room] = await db
    .insert(rooms)
    .values({
      slug,
      title: input.title,
      ownerIdentityId: input.ownerIdentityId,
      boardId: input.boardId ?? null,
      accessPolicy,
      kind,
      livekitRoomName: `meet_${slug}`,
    })
    .returning();

  let brandValues: Record<string, unknown> = defaultBrandValues(
    input.title,
    input.themePreset,
  );

  if (input.ui) {
    const uiPatch = brandFieldsToPatch(input.ui);
    brandValues = {
      ...brandValues,
      ...uiPatch,
      wordmark:
        (uiPatch.wordmark as string | null | undefined) ??
        (brandValues.wordmark as string),
      lobbyTitle:
        (uiPatch.lobbyTitle as string | null | undefined) ??
        (brandValues.lobbyTitle as string),
    };
    if (
      input.ui.themePreset &&
      BOARD_THEMES[input.ui.themePreset] &&
      input.ui.primaryColor === undefined &&
      input.ui.primaryPaint === undefined
    ) {
      const c = BOARD_THEMES[input.ui.themePreset];
      brandValues.primaryColor = c.primary;
      brandValues.secondaryColor = c.secondary;
      brandValues.tertiaryColor = c.tertiary;
      brandValues.themePreset = input.ui.themePreset;
    }
  } else if (input.useIdentityBrand !== false) {
    const identityBrand = await db.query.identityBrands.findFirst({
      where: eq(identityBrands.identityId, input.ownerIdentityId),
    });
    if (identityBrand) {
      brandValues = identityBrandToRoomValues(identityBrand, input.title);
    }
  }

  const [brand] = await db
    .insert(roomBrands)
    .values({
      roomId: room.id,
      ...brandValues,
    })
    .returning();

  const links = roomJoinUrl(room.slug);
  return { room, brand, ...links };
}

export async function resolveOwnerIdentityId(args: {
  owner_identity_id?: string;
  chronos_user_id?: string;
  title?: string;
}): Promise<string> {
  if (args.owner_identity_id) {
    const existing = await db.query.chronosIdentities.findFirst({
      where: eq(chronosIdentities.id, args.owner_identity_id),
    });
    if (!existing) throw new Error("owner_identity_id not found");
    return existing.id;
  }

  if (!args.chronos_user_id) {
    throw new Error("owner_identity_id or chronos_user_id required");
  }

  const chronosUserId = String(args.chronos_user_id);
  const existing = await db.query.chronosIdentities.findFirst({
    where: eq(chronosIdentities.chronosUserId, chronosUserId),
  });
  if (existing) return existing.id;

  const [row] = await db
    .insert(chronosIdentities)
    .values({
      chronosUserId,
      name: args.title ? "Chronos user" : undefined,
    })
    .returning();
  return row.id;
}

export function authorizeBearer(req: {
  headers: { get(name: string): string | null };
}): boolean {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const expected =
    process.env.MEET_MCP_TOKEN || process.env.AGENT_SHARED_SECRET || "";
  if (!expected) return false;
  return token === expected;
}

async function evictLiveKitRoom(livekitRoomName: string) {
  try {
    const client = getRoomServiceClient();
    await client.deleteRoom(livekitRoomName);
  } catch (err) {
    console.warn("[chronos-meet] livekit deleteRoom on room delete", err);
  }
}

async function removeBrandAssetDirs(roomId: string) {
  for (const root of [BRAND_ASSETS_ROOT, LEGACY_BRAND_ASSETS_ROOT]) {
    try {
      await rm(path.join(root, roomId), { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/** Hard-delete a room and related rows (DB cascade). Owner must already be checked. */
export async function deleteRoomFully(room: typeof rooms.$inferSelect) {
  const active = await db.query.meetings.findFirst({
    where: (m, { and: a, eq: e }) =>
      a(e(m.roomId, room.id), e(m.status, "active")),
  });
  if (active || room.livekitRoomName) {
    await evictLiveKitRoom(room.livekitRoomName);
  }

  await db.delete(rooms).where(eq(rooms.id, room.id));
  await removeBrandAssetDirs(room.id);
}
