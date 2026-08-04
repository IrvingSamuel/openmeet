import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  actionItems,
  chatMessages,
  copilotChatMessages,
  meetingSummaries,
  meetings,
  rooms,
  transcriptSegments,
  type WebhookEventsConfig,
} from "@/db/schema";
import {
  getAppSettings,
  webhookEventsOrDefault,
} from "@/lib/app-settings";
import {
  exampleWebhookPayload,
  type OutboundWebhookEvent,
  type WebhookEnvelope,
  type WebhookMeetingMeta,
} from "@/lib/webhook-payloads";
import { buildWebhookHeaders } from "@/lib/webhook-sign";

export type { OutboundWebhookEvent, WebhookEnvelope, WebhookMeetingMeta };
export { exampleWebhookPayload } from "@/lib/webhook-payloads";
export { buildWebhookHeaders, signWebhookPayload } from "@/lib/webhook-sign";

const EVENT_TOGGLE: Record<
  OutboundWebhookEvent,
  keyof WebhookEventsConfig
> = {
  "transcript.ready": "transcript",
  "chat.ready": "chat",
  "summary.ready": "summary",
  "tasks.generated": "tasks",
};

async function loadMeetingMeta(
  meetingId: string,
): Promise<WebhookMeetingMeta | null> {
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) return null;
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, meeting.roomId),
  });
  return {
    id: meeting.id,
    roomSlug: room?.slug ?? "",
    roomTitle: room?.title ?? "",
    startedAt: meeting.startedAt.toISOString(),
    endedAt: meeting.endedAt ? meeting.endedAt.toISOString() : null,
  };
}

async function buildTranscriptPayload(
  meetingId: string,
  meta: WebhookMeetingMeta,
): Promise<WebhookEnvelope> {
  const segments = await db.query.transcriptSegments.findMany({
    where: eq(transcriptSegments.meetingId, meetingId),
    orderBy: [asc(transcriptSegments.createdAt)],
  });
  return {
    event: "transcript.ready",
    version: 1,
    sentAt: new Date().toISOString(),
    meeting: meta,
    data: {
      segments: segments.map((s) => ({
        id: s.id,
        speakerLabel: s.speakerLabel,
        text: s.text,
        isFinal: s.isFinal,
        startedAtMs: s.startedAtMs,
        endedAtMs: s.endedAtMs,
        createdAt: s.createdAt.toISOString(),
      })),
    },
  };
}

async function buildChatPayload(
  meetingId: string,
  meta: WebhookMeetingMeta,
): Promise<WebhookEnvelope> {
  const [messages, copilot] = await Promise.all([
    db.query.chatMessages.findMany({
      where: eq(chatMessages.meetingId, meetingId),
      orderBy: [asc(chatMessages.createdAt)],
    }),
    db.query.copilotChatMessages.findMany({
      where: eq(copilotChatMessages.meetingId, meetingId),
      orderBy: [asc(copilotChatMessages.createdAt)],
    }),
  ]);
  return {
    event: "chat.ready",
    version: 1,
    sentAt: new Date().toISOString(),
    meeting: meta,
    data: {
      messages: messages.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        livekitIdentity: m.livekitIdentity,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      copilotMessages: copilot.map((m) => ({
        id: m.id,
        role: m.role,
        body: m.body,
        authorName: m.authorName,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  };
}

async function buildSummaryPayload(
  meetingId: string,
  meta: WebhookMeetingMeta,
): Promise<WebhookEnvelope | null> {
  const summary = await db.query.meetingSummaries.findFirst({
    where: eq(meetingSummaries.meetingId, meetingId),
  });
  if (!summary) return null;
  return {
    event: "summary.ready",
    version: 1,
    sentAt: new Date().toISOString(),
    meeting: meta,
    data: {
      summaryMarkdown: summary.summaryMarkdown,
      model: summary.model,
    },
  };
}

async function buildTasksPayload(
  meetingId: string,
  meta: WebhookMeetingMeta,
): Promise<WebhookEnvelope | null> {
  const items = await db.query.actionItems.findMany({
    where: eq(actionItems.meetingId, meetingId),
    orderBy: [asc(actionItems.createdAt)],
  });
  if (items.length === 0) return null;
  return {
    event: "tasks.generated",
    version: 1,
    sentAt: new Date().toISOString(),
    meeting: meta,
    data: {
      tasks: items.map((item) => {
        const raw =
          item.raw && typeof item.raw === "object"
            ? (item.raw as Record<string, unknown>)
            : {};
        return {
          id: item.id,
          title: item.title,
          assigneeHint: item.assigneeHint,
          status: item.status,
          priority: typeof raw.priority === "string" ? raw.priority : undefined,
          dueDateHint:
            typeof raw.dueDateHint === "string" ? raw.dueDateHint : undefined,
          description:
            typeof raw.description === "string" ? raw.description : undefined,
          checklist: Array.isArray(raw.checklist) ? raw.checklist : undefined,
        };
      }),
    },
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function deliverWebhook(opts: {
  url: string;
  secret?: string | null;
  envelope: WebhookEnvelope;
  maxAttempts?: number;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(opts.envelope);
  const headers = buildWebhookHeaders({
    event: opts.envelope.event,
    body,
    secret: opts.secret,
  });
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastError = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(opts.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        return { ok: true, status: res.status };
      }
      lastError = `HTTP ${res.status}`;
      console.warn(
        `[chronos-meet] webhook ${opts.envelope.event} attempt ${attempt} failed: ${lastError}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[chronos-meet] webhook ${opts.envelope.event} attempt ${attempt} error: ${lastError}`,
      );
    }
    if (attempt < maxAttempts) {
      await sleep(250 * attempt);
    }
  }
  return { ok: false, error: lastError };
}

async function getDeliveryConfig(): Promise<{
  url: string;
  secret: string | null;
  events: WebhookEventsConfig;
} | null> {
  const settings = await getAppSettings();
  if (!settings?.webhookEnabled) return null;
  const url = settings.webhookUrl?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }
  return {
    url,
    secret: settings.webhookSecret?.trim() || null,
    events: webhookEventsOrDefault(settings.webhookEvents),
  };
}

async function deliverIfEnabled(
  event: OutboundWebhookEvent,
  envelope: WebhookEnvelope | null,
) {
  if (!envelope) return;
  const config = await getDeliveryConfig();
  if (!config) return;
  const toggle = EVENT_TOGGLE[event];
  if (!config.events[toggle]) return;
  const result = await deliverWebhook({
    url: config.url,
    secret: config.secret,
    envelope,
  });
  if (!result.ok) {
    console.error(
      `[chronos-meet] webhook ${event} delivery failed:`,
      result.error,
    );
  }
}

/** Fire transcript + chat webhooks after a meeting ends. */
export async function dispatchMeetingEndedWebhooks(meetingId: string) {
  const meta = await loadMeetingMeta(meetingId);
  if (!meta) return;
  const config = await getDeliveryConfig();
  if (!config) return;

  const jobs: Promise<void>[] = [];
  if (config.events.transcript) {
    jobs.push(
      buildTranscriptPayload(meetingId, meta).then((envelope) =>
        deliverIfEnabled("transcript.ready", envelope),
      ),
    );
  }
  if (config.events.chat) {
    jobs.push(
      buildChatPayload(meetingId, meta).then((envelope) =>
        deliverIfEnabled("chat.ready", envelope),
      ),
    );
  }
  await Promise.all(jobs);
}

/** Fire summary + tasks webhooks after summary generation. */
export async function dispatchSummaryReadyWebhooks(meetingId: string) {
  const meta = await loadMeetingMeta(meetingId);
  if (!meta) return;
  const config = await getDeliveryConfig();
  if (!config) return;

  const jobs: Promise<void>[] = [];
  if (config.events.summary) {
    jobs.push(
      buildSummaryPayload(meetingId, meta).then((envelope) =>
        deliverIfEnabled("summary.ready", envelope),
      ),
    );
  }
  if (config.events.tasks) {
    jobs.push(
      buildTasksPayload(meetingId, meta).then((envelope) =>
        deliverIfEnabled("tasks.generated", envelope),
      ),
    );
  }
  await Promise.all(jobs);
}

/** Send an example payload to the configured webhook URL (admin test). */
export async function sendTestWebhook(
  event: OutboundWebhookEvent,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const settings = await getAppSettings();
  const url = settings?.webhookUrl?.trim();
  if (!url) {
    return { ok: false, error: "webhook_url_missing" };
  }
  const envelope = exampleWebhookPayload(event);
  return deliverWebhook({
    url,
    secret: settings?.webhookSecret?.trim() || null,
    envelope,
    maxAttempts: 1,
  });
}
