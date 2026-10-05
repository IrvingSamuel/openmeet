"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomEvent, type Room } from "livekit-client";

export type LiveStreamStatus = "starting" | "live" | "ending";

export type ActiveLiveStream = {
  id: string;
  status: LiveStreamStatus;
  startedAt: string | null;
} | null;

type StatusResponse = {
  enabled?: boolean;
  captionsEnabled?: boolean;
  active?: ActiveLiveStream;
  lastError?: string | null;
};

const TOPIC = "live-stream";

/** Egress takes a few seconds to boot Chrome; poll faster while transitioning. */
const POLL_TRANSITION_MS = 4_000;
const POLL_LIVE_MS = 20_000;

export type LiveStreamStartError = {
  error: string;
  detail?: string;
};

export function useLiveStream(opts: {
  room: Room | null | undefined;
  meetingId?: string | null;
  canModerate: boolean;
}) {
  const { room, meetingId, canModerate } = opts;
  const [enabled, setEnabled] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [active, setActive] = useState<ActiveLiveStream>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const publishState = useCallback(
    (next: ActiveLiveStream) => {
      if (!room) return;
      const data = new TextEncoder().encode(
        JSON.stringify({ live: Boolean(next), stream: next }),
      );
      void room.localParticipant
        .publishData(data, { reliable: true, topic: TOPIC })
        .catch(() => undefined);
    },
    [room],
  );

  const refresh = useCallback(async () => {
    if (!meetingId) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/live`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as StatusResponse;
      setEnabled(Boolean(json.enabled));
      setCaptionsEnabled(json.captionsEnabled !== false);
      const next = json.active ?? null;
      const prev = activeRef.current;
      setActive(next);
      if (json.lastError) setLastError(json.lastError);
      if (canModerate && (prev?.status ?? null) !== (next?.status ?? null)) {
        publishState(next);
      }
    } catch {
      // transient network error; keep last known state
    }
  }, [meetingId, canModerate, publishState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Moderators reconcile with Egress so failures surface without webhooks.
  useEffect(() => {
    if (!canModerate || !active) return;
    const ms = active.status === "live" ? POLL_LIVE_MS : POLL_TRANSITION_MS;
    const timer = window.setInterval(() => void refresh(), ms);
    return () => window.clearInterval(timer);
  }, [canModerate, active, refresh]);

  useEffect(() => {
    if (!room) return;
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== TOPIC) return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          live?: boolean;
          stream?: ActiveLiveStream;
        };
        setActive(msg.live && msg.stream ? msg.stream : null);
      } catch {
        // ignore malformed payloads
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const start = useCallback(
    async (input: {
      streamKey: string;
      rtmpUrl?: string;
    }): Promise<{ ok: true } | ({ ok: false } & LiveStreamStartError)> => {
      if (!meetingId) return { ok: false, error: "no_meeting" };
      setBusy(true);
      setLastError(null);
      try {
        const res = await fetch(`/api/meetings/${meetingId}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            streamKey: input.streamKey,
            rtmpUrl: input.rtmpUrl || null,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          active?: ActiveLiveStream;
        };
        if (!res.ok) {
          return {
            ok: false,
            error: json.error || "egress_start_failed",
            detail: json.detail,
          };
        }
        const next = json.active ?? null;
        setActive(next);
        publishState(next);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: "network_error",
          detail: err instanceof Error ? err.message : String(err),
        };
      } finally {
        setBusy(false);
      }
    },
    [meetingId, publishState],
  );

  const stop = useCallback(async () => {
    if (!meetingId) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!res.ok) return false;
      setActive(null);
      publishState(null);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [meetingId, publishState]);

  return {
    enabled,
    captionsEnabled,
    active,
    busy,
    lastError,
    clearLastError: () => setLastError(null),
    canControl: canModerate && enabled,
    start,
    stop,
    refresh,
  };
}
