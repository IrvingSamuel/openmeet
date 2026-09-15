import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppSettings } from "@/lib/app-settings";
import {
  DEFAULT_PAGE_ACCESS,
  keysMatch,
  normalizePageAccessSettings,
  PAGE_ACCESS_COOKIE,
  pageAccessCookieValue,
} from "@/lib/page-access";

const bodySchema = z.object({
  key: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const row = await getAppSettings();
  const settings = normalizePageAccessSettings(
    row?.pageAccess ?? DEFAULT_PAGE_ACCESS,
  );
  if (!settings.requestKey) {
    return NextResponse.json({ error: "key_not_configured" }, { status: 400 });
  }
  if (!keysMatch(body.key, settings.requestKey)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PAGE_ACCESS_COOKIE, pageAccessCookieValue(settings.requestKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PAGE_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
