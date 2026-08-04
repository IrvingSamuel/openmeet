import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import {
  exampleWebhookPayload,
  sendTestWebhook,
  type OutboundWebhookEvent,
} from "@/lib/outbound-webhooks";
import { getSession } from "@/lib/session";

const schema = z.object({
  event: z.enum([
    "transcript.ready",
    "chat.ready",
    "summary.ready",
    "tasks.generated",
  ]),
  /** If true, only return the example payload without POSTing. */
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const event = body.event as OutboundWebhookEvent;
  const example = exampleWebhookPayload(event);

  if (body.dryRun) {
    return NextResponse.json({ ok: true, example });
  }

  const result = await sendTestWebhook(event);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "delivery_failed",
        example,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    example,
  });
}
