import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { publicApiTokens } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { maskSecret } from "@/lib/app-settings";
import {
  findActiveTokenByName,
  listActivePublicApiTokens,
  migrateLegacyPublicApiToken,
  toPublicApiTokenPublic,
} from "@/lib/public-api-tokens";
import { getSession, sessionUserId } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const ownerId = sessionUserId(session);
  if (!isAdmin(session) || !ownerId) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { session, ownerId };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** GET — list active public API tokens (no plaintext). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  await migrateLegacyPublicApiToken();
  const rows = await listActivePublicApiTokens();
  return NextResponse.json({
    tokens: rows.map(toPublicApiTokenPublic),
  });
}

/** POST — create a named public API Bearer token (shown once). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: String(err) },
      { status: 400 },
    );
  }

  await migrateLegacyPublicApiToken();

  const name = body.name.trim();
  const taken = await findActiveTokenByName(name);
  if (taken) {
    return NextResponse.json(
      { error: "name_taken", detail: "An active token with this name already exists" },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const preview = maskSecret(token).preview ?? `••••${token.slice(-4)}`;
  const now = new Date();

  const [row] = await db
    .insert(publicApiTokens)
    .values({
      name,
      token,
      tokenPreview: preview,
      ownerIdentityId: auth.ownerId,
      createdAt: now,
    })
    .returning();

  return NextResponse.json({
    token,
    id: row.id,
    name: row.name,
    preview: row.tokenPreview,
    created_at: row.createdAt.toISOString(),
    owner_identity_id: row.ownerIdentityId,
    warning:
      "Guarde este token agora — não será mostrado novamente na íntegra.",
  });
}
