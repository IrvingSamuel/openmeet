import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  identityBrands,
  meetingBrands,
  meetings,
  roomBrands,
  rooms,
} from "@/db/schema";
import { BOARD_THEMES } from "@/lib/brand";
import {
  brandFieldsToPatch,
  type BrandFieldsInput,
} from "@/lib/brand-schema";

export type CreateMeetingInput = {
  title: string;
  ownerIdentityId: string;
  slug?: string;
  boardId?: string | null;
  accessPolicy?: "public" | "members" | "invite";
  /** Optional brand template room (does not own the meeting). */
  roomId?: string | null;
  themePreset?: string;
  ui?: BrandFieldsInput;
  useIdentityBrand?: boolean;
};

export type CreatedMeetingResult = {
  meeting: typeof meetings.$inferSelect;
  brand: typeof meetingBrands.$inferSelect;
  url: string;
  joinPath: string;
};

function publicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://meet.chronos.com.pt"
  );
}

export function meetingJoinUrl(slug: string): {
  url: string;
  joinPath: string;
} {
  const joinPath = `/m/${slug}`;
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

function brandRowToValues(
  row: Record<string, unknown>,
  title: string,
): Record<string, unknown> {
  return {
    logoUrl: row.logoUrl ?? null,
    wordmark: (row.wordmark as string) || title,
    themePreset: (row.themePreset as string) || "violet",
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    tertiaryColor: row.tertiaryColor,
    fontFamily: row.fontFamily,
    background: row.background,
    lobbyTitle: (row.lobbyTitle as string) || title,
    lobbySubtitle:
      (row.lobbySubtitle as string) || "Powered by Chronos Meet",
    faviconUrl: row.faviconUrl ?? null,
    customCss: row.customCss ?? null,
    primaryPaint: row.primaryPaint ?? null,
    secondaryPaint: row.secondaryPaint ?? null,
    tertiaryPaint: row.tertiaryPaint ?? null,
    backgroundPaint: row.backgroundPaint ?? null,
    patternUrl: row.patternUrl ?? null,
    patternSizeMode: row.patternSizeMode ?? null,
    patternSize: row.patternSize ?? null,
    patternTint: row.patternTint ?? null,
    patternTintColor: row.patternTintColor ?? null,
    patternTintOpacity: row.patternTintOpacity ?? null,
    bgAnimation: row.bgAnimation ?? null,
    bgAnimationSpeed: row.bgAnimationSpeed ?? null,
  };
}

async function resolveBrandValues(input: CreateMeetingInput) {
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
    return brandValues;
  }

  if (input.roomId) {
    const roomBrand = await db.query.roomBrands.findFirst({
      where: eq(roomBrands.roomId, input.roomId),
    });
    if (roomBrand) {
      return brandRowToValues(roomBrand as unknown as Record<string, unknown>, input.title);
    }
  }

  if (input.useIdentityBrand !== false) {
    const identityBrand = await db.query.identityBrands.findFirst({
      where: eq(identityBrands.identityId, input.ownerIdentityId),
    });
    if (identityBrand) {
      return brandRowToValues(
        identityBrand as unknown as Record<string, unknown>,
        input.title,
      );
    }
  }

  return brandValues;
}

export async function createMeetingWithBrand(
  input: CreateMeetingInput,
): Promise<CreatedMeetingResult> {
  const slug = (input.slug || nanoid(10)).toLowerCase();
  let boardId = input.boardId ?? null;
  let accessPolicy = input.accessPolicy || "public";
  const roomId = input.roomId ?? null;

  if (roomId) {
    const room = await db.query.rooms.findFirst({
      where: eq(rooms.id, roomId),
    });
    if (!room) throw new Error("room_template_not_found");
    if (boardId === null && room.boardId) boardId = room.boardId;
    if (!input.accessPolicy) accessPolicy = room.accessPolicy as typeof accessPolicy;
  }

  const brandValues = await resolveBrandValues({
    ...input,
    roomId,
  });

  const [meeting] = await db
    .insert(meetings)
    .values({
      slug,
      title: input.title,
      ownerIdentityId: input.ownerIdentityId,
      boardId,
      accessPolicy,
      livekitRoomName: `meet_${slug}`,
      roomId,
      status: "scheduled",
    })
    .returning();

  const [brand] = await db
    .insert(meetingBrands)
    .values({
      meetingId: meeting.id,
      ...brandValues,
    })
    .returning();

  const links = meetingJoinUrl(meeting.slug);
  return { meeting, brand, ...links };
}
