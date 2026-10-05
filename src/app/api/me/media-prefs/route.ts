import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { identityMediaPrefs } from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  DEFAULT_MEDIA_PREFS,
  mediaPrefsFieldsSchema,
  mediaPrefsFieldsToPatch,
  mediaPrefsFromRow,
} from "@/lib/media-prefs-schema";

function defaultRow(identityId: string) {
  return {
    identityId,
    videoEffect: DEFAULT_MEDIA_PREFS.videoEffect,
    blurRadius: DEFAULT_MEDIA_PREFS.blurRadius,
    virtualBackgroundUrl: DEFAULT_MEDIA_PREFS.virtualBackgroundUrl,
    noiseSuppression: DEFAULT_MEDIA_PREFS.noiseSuppression,
    echoCancellation: DEFAULT_MEDIA_PREFS.echoCancellation,
    autoGainControl: DEFAULT_MEDIA_PREFS.autoGainControl,
    captionsDefault: DEFAULT_MEDIA_PREFS.captionsDefault,
    tabReturnEnabled: DEFAULT_MEDIA_PREFS.tabReturnEnabled,
    tabReturnMic: DEFAULT_MEDIA_PREFS.tabReturnMic,
    tabReturnCamera: DEFAULT_MEDIA_PREFS.tabReturnCamera,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let row = await db.query.identityMediaPrefs.findFirst({
    where: eq(identityMediaPrefs.identityId, session.identityId),
  });

  if (!row) {
    const [created] = await db
      .insert(identityMediaPrefs)
      .values(defaultRow(session.identityId))
      .returning();
    row = created;
  }

  return NextResponse.json({ prefs: mediaPrefsFromRow(row) });
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

  const parsed = mediaPrefsFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.message },
      { status: 400 },
    );
  }

  const patch = mediaPrefsFieldsToPatch(parsed.data);
  const existing = await db.query.identityMediaPrefs.findFirst({
    where: eq(identityMediaPrefs.identityId, session.identityId),
  });

  if (!existing) {
    const [created] = await db
      .insert(identityMediaPrefs)
      .values({
        ...defaultRow(session.identityId),
        ...patch,
      })
      .returning();
    return NextResponse.json({ prefs: mediaPrefsFromRow(created) });
  }

  const [updated] = await db
    .update(identityMediaPrefs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(identityMediaPrefs.identityId, session.identityId))
    .returning();

  return NextResponse.json({ prefs: mediaPrefsFromRow(updated) });
}
