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
import {
  platformPoweredBySubtitle,
  platformWordmark,
} from "@/lib/platform-defaults";

async function defaultIdentityBrand(identityId: string) {
  const colors = BOARD_THEMES.sky;
  const name = await platformWordmark();
  const poweredBy = await platformPoweredBySubtitle();
  return {
    identityId,
    themePreset: "sky",
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    wordmark: name,
    lobbyTitle: name,
    lobbySubtitle: poweredBy,
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
      .values(await defaultIdentityBrand(session.identityId))
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = brandFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.message },
      { status: 400 },
    );
  }

  const patch = brandFieldsToPatch(parsed.data);
  const existing = await db.query.identityBrands.findFirst({
    where: eq(identityBrands.identityId, session.identityId),
  });

  if (!existing) {
    const [created] = await db
      .insert(identityBrands)
      .values({
        ...(await defaultIdentityBrand(session.identityId)),
        ...patch,
      })
      .returning();
    return NextResponse.json({ brand: created });
  }

  const [updated] = await db
    .update(identityBrands)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(identityBrands.identityId, session.identityId))
    .returning();

  return NextResponse.json({ brand: updated });
}
