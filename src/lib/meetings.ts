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
import { platformPoweredBySubtitle } from "@/lib/platform-defaults";
import {
  generateHostEntryToken,
  hashHostEntryToken,
  meetingHostEnterUrl,
} from "@/lib/host-entry";

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
  /** Per-meeting empty timeout (seconds); null/undefined = env default. */
  emptyTimeoutSec?: number | null;
  /** Absolute http(s) URL after leave/end. */
  redirectAfterMeet?: string | null;
  /**
   * Wait in lobby until a host is present. Defaults to false;
   * public API sets true for invite when omitted.
   */
  waitForHost?: boolean;
  /** Issue a host entry token / host_url (default false — enable for public API). */
  issueHostEntry?: boolean;
};

export type CreatedMeetingResult = {
  meeting: typeof meetings.$inferSelect;
  brand: typeof meetingBrands.$inferSelect;
  url: string;
  joinPath: string;
  hostUrl: string | null;
  hostPath: string | null;
  /** Raw token only available at creation time (never stored plaintext). */
  hostEntryToken: string | null;
};

function publicOrigin(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL is required");
  }
  return url;
}

export function meetingJoinUrl(slug: string): {
  url: string;
  joinPath: string;
} {
  const joinPath = `/m/${slug}`;
  return { joinPath, url: `${publicOrigin()}${joinPath}` };
}

async function defaultBrandValues(title: string, themePreset?: string) {
  const preset =
    themePreset && BOARD_THEMES[themePreset] ? themePreset : "sky";
  const colors = BOARD_THEMES[preset];
  const poweredBy = await platformPoweredBySubtitle();
  return {
    themePreset: preset,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: title,
    lobbyTitle: title,
    lobbySubtitle: poweredBy,
  };
}

async function brandRowToValues(
  row: Record<string, unknown>,
  title: string,
): Promise<Record<string, unknown>> {
  const poweredBy = await platformPoweredBySubtitle();
  return {
    logoUrl: row.logoUrl ?? null,
    wordmark: (row.wordmark as string) || title,
    themePreset: (row.themePreset as string) || "sky",
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    tertiaryColor: row.tertiaryColor,
    fontFamily: row.fontFamily,
    background: row.background,
    lobbyTitle: (row.lobbyTitle as string) || title,
    lobbySubtitle: (row.lobbySubtitle as string) || poweredBy,
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
  let brandValues: Record<string, unknown> = await defaultBrandValues(
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
      return brandRowToValues(
        roomBrand as unknown as Record<string, unknown>,
        input.title,
      );
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

  const waitForHost = input.waitForHost === true;

  const issueHostEntry = input.issueHostEntry === true;
  const hostEntryToken = issueHostEntry ? generateHostEntryToken() : null;
  const hostEntryTokenHash = hostEntryToken
    ? hashHostEntryToken(hostEntryToken)
    : null;

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
      emptyTimeoutSec: input.emptyTimeoutSec ?? null,
      redirectAfterMeet: input.redirectAfterMeet ?? null,
      waitForHost,
      hostEntryTokenHash,
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
  const hostLinks =
    hostEntryToken && meeting.id
      ? meetingHostEnterUrl(meeting.id, hostEntryToken)
      : { hostUrl: null, hostPath: null };

  return {
    meeting,
    brand,
    ...links,
    hostUrl: hostLinks.hostUrl,
    hostPath: hostLinks.hostPath,
    hostEntryToken,
  };
}
