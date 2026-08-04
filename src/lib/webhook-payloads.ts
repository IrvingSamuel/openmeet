/** Shared webhook event contracts + static examples (safe for client + server). */

export type OutboundWebhookEvent =
  | "transcript.ready"
  | "chat.ready"
  | "summary.ready"
  | "tasks.generated"
  | "recording.ready";

export type WebhookMeetingMeta = {
  id: string;
  roomSlug: string;
  roomTitle: string;
  startedAt: string;
  endedAt: string | null;
};

export type WebhookEnvelope<T = unknown> = {
  event: OutboundWebhookEvent;
  version: 1;
  sentAt: string;
  meeting: WebhookMeetingMeta;
  data: T;
};

export const OUTBOUND_WEBHOOK_EVENTS: OutboundWebhookEvent[] = [
  "transcript.ready",
  "chat.ready",
  "summary.ready",
  "tasks.generated",
  "recording.ready",
];

export function exampleWebhookPayload(
  event: OutboundWebhookEvent,
): WebhookEnvelope {
  const meeting: WebhookMeetingMeta = {
    id: "11111111-1111-1111-1111-111111111111",
    roomSlug: "standup",
    roomTitle: "Standup",
    startedAt: "2026-08-04T11:00:00.000Z",
    endedAt: "2026-08-04T11:30:00.000Z",
  };
  const sentAt = "2026-08-04T11:30:05.000Z";

  switch (event) {
    case "transcript.ready":
      return {
        event,
        version: 1,
        sentAt,
        meeting,
        data: {
          segments: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              speakerLabel: "Ana",
              text: "Vamos começar pelo status do sprint.",
              isFinal: true,
              startedAtMs: 1200,
              endedAtMs: 4100,
              createdAt: "2026-08-04T11:01:02.000Z",
            },
            {
              id: "33333333-3333-3333-3333-333333333333",
              speakerLabel: "Caio",
              text: "O board já está atualizado.",
              isFinal: true,
              startedAtMs: 4500,
              endedAtMs: 7200,
              createdAt: "2026-08-04T11:01:08.000Z",
            },
          ],
        },
      };
    case "chat.ready":
      return {
        event,
        version: 1,
        sentAt,
        meeting,
        data: {
          messages: [
            {
              id: "44444444-4444-4444-4444-444444444444",
              displayName: "Ana",
              livekitIdentity: "ana-1",
              body: "Link do doc na descrição.",
              createdAt: "2026-08-04T11:10:00.000Z",
            },
          ],
          copilotMessages: [
            {
              id: "55555555-5555-5555-5555-555555555555",
              role: "user",
              body: "Quais foram os principais pontos?",
              authorName: "Ana",
              createdAt: "2026-08-04T11:15:00.000Z",
            },
            {
              id: "66666666-6666-6666-6666-666666666666",
              role: "assistant",
              body: "1) Status do sprint\n2) Board atualizado",
              authorName: null,
              createdAt: "2026-08-04T11:15:02.000Z",
            },
          ],
        },
      };
    case "summary.ready":
      return {
        event,
        version: 1,
        sentAt,
        meeting,
        data: {
          summaryMarkdown:
            "## Principais pontos\n\n- Status do sprint alinhado\n- Board atualizado\n",
          model: "gemini-3.5-flash-lite",
        },
      };
    case "tasks.generated":
      return {
        event,
        version: 1,
        sentAt,
        meeting,
        data: {
          tasks: [
            {
              id: "77777777-7777-7777-7777-777777777777",
              title: "Publicar release notes",
              assigneeHint: "Caio",
              priority: "medium",
              dueDateHint: "2026-08-05",
              checklist: ["Rascunhar", "Revisar", "Publicar"],
              status: "pending",
              description: "Documentar as mudanças da sprint.",
            },
          ],
        },
      };
    case "recording.ready":
      return {
        event,
        version: 1,
        sentAt,
        meeting,
        data: {
          recordingId: "88888888-8888-8888-8888-888888888888",
          status: "ready",
          engine: "browser",
          storageBackend: "local",
          mimeType: "video/webm",
          bytes: 12_345_678,
          downloadPath:
            "/api/meetings/11111111-1111-1111-1111-111111111111/recording/88888888-8888-8888-8888-888888888888/file",
          startedAt: "2026-08-04T11:00:10.000Z",
          endedAt: "2026-08-04T11:30:00.000Z",
        },
      };
  }
}

/** Static header example for the admin UI (signature is illustrative). */
export function exampleWebhookHeaders(event: OutboundWebhookEvent): string {
  return [
    "Content-Type: application/json",
    `X-Chronos-Meet-Event: ${event}`,
    "X-Chronos-Meet-Timestamp: 1722771000",
    "X-Chronos-Meet-Signature: sha256=<hmac_sha256(secret, timestamp + '.' + body)>",
    "User-Agent: Chronos-Meet-Webhooks/1.0",
  ].join("\n");
}
