export const DISCONNECT_TELEMETRY_PATH = "/api/telemetry/disconnect";

export const DISCONNECT_TELEMETRY_EVENTS = [
  "disconnected",
  "reconnected",
  "gave_up",
  "duplicate",
] as const;

export type DisconnectTelemetryEvent =
  (typeof DISCONNECT_TELEMETRY_EVENTS)[number];

export type DisconnectTelemetryPayload = {
  event: DisconnectTelemetryEvent;
  slug: string;
  meetingId?: string;
  /** livekit-client DisconnectReason (numeric enum) when known. */
  reason?: number | null;
  outcome?: string;
  visibilityState?: string;
  /** Chrome fired `freeze` since the last report. */
  wasFrozen?: boolean;
  attempt?: number;
  userAgent?: string;
};

/** Fire-and-forget; must never throw into the room's event handlers. */
export function reportDisconnectTelemetry(
  payload: Omit<DisconnectTelemetryPayload, "userAgent" | "visibilityState">,
): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      ...payload,
      visibilityState: document.visibilityState,
      userAgent: navigator.userAgent,
    } satisfies DisconnectTelemetryPayload);
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.(DISCONNECT_TELEMETRY_PATH, blob)) return;
    void fetch(DISCONNECT_TELEMETRY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* telemetry is best-effort */
  }
}
