import { NextResponse } from "next/server";
import { z } from "zod";
import { DISCONNECT_TELEMETRY_EVENTS } from "@/lib/disconnect-telemetry";

const MAX_BODY_BYTES = 4096;

const payloadSchema = z.object({
  event: z.enum(DISCONNECT_TELEMETRY_EVENTS),
  slug: z.string().min(1).max(128),
  meetingId: z.string().max(64).optional(),
  reason: z.number().int().min(0).max(64).nullable().optional(),
  outcome: z.string().max(32).optional(),
  visibilityState: z.string().max(16).optional(),
  wasFrozen: z.boolean().optional(),
  attempt: z.number().int().min(0).max(100).optional(),
  userAgent: z.string().max(512).optional(),
});

/**
 * Client-side disconnect beacons (sendBeacon). The SFU logs SDK-initiated
 * disconnects as CLIENT_REQUEST_LEAVE, indistinguishable from a real leave, so
 * this is the only place browser/freeze context is visible. Logged to stdout
 * (pm2) — grep for `[openmeet:disconnect]`.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 400 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }
  console.info(
    `[openmeet:disconnect] ${JSON.stringify({
      at: new Date().toISOString(),
      ...parsed.data,
    })}`,
  );
  return new NextResponse(null, { status: 204 });
}
