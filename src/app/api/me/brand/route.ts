import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { identityBrands } from "@/db/schema";
import { getSession } from "@/lib/session";
import { BOARD_THEMES } from "@/lib/brand";
import {
  brandFieldsSchema,
  brandFieldsToPatch,
} from "@/lib/brand-schema";

function defaultIdentityBrand(identityId: string) {
  const colors = BOARD_THEMES.sky;
  return {
    identityId,
    themePreset: "sky",
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: "OpenMeet",
    lobbyTitle: "OpenMeet",
    lobbySubtitle: "Powered by OpenMeet",
  };
}

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let brand = await db.query.identityBrands.findFirst({
    where: eq(identityBrands.identityId, session.identityId),
  });

  if (!brand) {
    const [created] = await db
      .insert(identityBrands)
      .values(defaultIdentityBrand(session.identityId))
      .returning();
    brand = created;
  }

  return NextResponse.json({ brand, themes: BOARD_THEMES });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = brandFieldsSchema.parse(await req.json());
  const patch: Record<string, unknown> = {
    ...brandFieldsToPatch(body),
    updatedAt: new Date(),
  };

  if (
    body.themePreset &&
    BOARD_THEMES[body.themePreset] &&
    !body.primaryColor &&
    body.primaryPaint === undefined
  ) {
    const c = BOARD_THEMES[body.themePreset];
    patch.primaryColor = c.primary;
    patch.secondaryColor = c.secondary;
    patch.tertiaryColor = c.tertiary;
  }

  const existing = await db.query.identityBrands.findFirst({
    where: eq(identityBrands.identityId, session.identityId),
  });

  if (!existing) {
    const [created] = await db
      .insert(identityBrands)
      .values({
        ...defaultIdentityBrand(session.identityId),
        ...patch,
      })
      .returning();
    return NextResponse.json({ brand: created });
  }

  const [brand] = await db
    .update(identityBrands)
    .set(patch)
    .where(eq(identityBrands.identityId, session.identityId))
    .returning();

  return NextResponse.json({ brand });
}
