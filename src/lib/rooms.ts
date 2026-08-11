import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { rm } from "fs/promises";
import path from "path";
import { db } from "@/db";
import {
  users,
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
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is required");
  return url;
}

export function roomJoinUrl(slug: string): { url: string; joinPath: string } {
  const joinPath = `/r/${slug}`;
  return { joinPath, url: `${publicOrigin()}${joinPath}` };
}

function defaultBrandValues(title: string, themePreset?: string) {
  const preset =
    themePreset && BOARD_THEMES[themePreset] ? themePreset : "sky";
  const colors = BOARD_THEMES[preset];
  return {
    themePreset: preset,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: title,
    lobbyTitle: title,
    lobbySubtitle: "Powered by OpenMeet",
  };
}

function identityBrandToRoomValues(
  row: typeof identityBrands.$inferSelect,
  title: string,
): Record<string, unknown> {
  return {
    logoUrl: row.logoUrl,
    wordmark: row.wordmark || title,
    themePreset: row.themePreset || "sky",
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    tertiaryColor: row.tertiaryColor,
    fontFamily: row.fontFamily,
    background: row.background,
    lobbyTitle: row.lobbyTitle || title,
    lobbySubtitle: row.lobbySubtitle || "Powered by OpenMeet",
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
  owner_user_id?: string;
  external_id?: string;
  title?: string;
}): Promise<string> {
  const ownerId = args.owner_identity_id || args.owner_user_id;
  if (ownerId) {
    const existing = await db.query.users.findFirst({
      where: eq(users.id, ownerId),
    });
    if (!existing) throw new Error("owner_identity_id not found");
    return existing.id;
  }

  if (!args.external_id) {
    throw new Error("owner_identity_id or external_id required");
  }

  const externalId = String(args.external_id);
  const existing = await db.query.users.findFirst({
    where: eq(users.externalId, externalId),
  });
  if (existing) return existing.id;

  const [row] = await db
    .insert(users)
    .values({
      externalId,
      name: args.title ? "API user" : "API user",
      role: "user",
      createdVia: "local",
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

async function removeBrandAssetDirs(roomId: string) {
  for (const root of [BRAND_ASSETS_ROOT, LEGACY_BRAND_ASSETS_ROOT]) {
    try {
      await rm(path.join(root, roomId), { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/** Hard-delete a brand-template room. Meetings that referenced it keep their history (roomId set null). */
export async function deleteRoomFully(room: typeof rooms.$inferSelect) {
  await db.delete(rooms).where(eq(rooms.id, room.id));
  await removeBrandAssetDirs(room.id);
}
