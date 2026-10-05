export const DISCONNECT_TELEMETRY_PATH = "/api/telemetry/disconnect";

export const DISCONNECT_TELEMETRY_EVENTS = [
  "disconnected",
  "reconnected",
  "gave_up",
  "duplicate",
  "client_error",
] as const;

export type DisconnectTelemetryEvent =
  (typeof DISCONNECT_TELEMETRY_EVENTS)[number];

export const CLIENT_ERROR_LIMITS = {
  name: 64,
  message: 500,
  stack: 2500,
  componentStack: 1500,
} as const;

export type ClientErrorDetails = {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  /** Set when the boundary auto-reloaded instead of showing the crash screen. */
  reloaded?: boolean;
};

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
  /** Only for `client_error`: what the meeting error boundary caught. */
  error?: ClientErrorDetails;
};

function clip(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

export function clientErrorDetails(
  error: unknown,
  componentStack?: string | null,
): ClientErrorDetails {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    name: clip(err.name, CLIENT_ERROR_LIMITS.name) ?? "Error",
    message: clip(err.message, CLIENT_ERROR_LIMITS.message) ?? "",
    stack: clip(err.stack, CLIENT_ERROR_LIMITS.stack),
    componentStack: clip(componentStack, CLIENT_ERROR_LIMITS.componentStack),
  };
}

/** Fire-and-forget; must never throw into the room's event handlers. */
export function reportDisconnectTelemetry(
  payload: Omit<DisconnectTelemetryPayload, "userAgent" | "visibilityState">,
): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      ...payload,
      visibilityState: document.visibilityState,
      userAgent: navigator.userAgent.slice(0, 512),
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
