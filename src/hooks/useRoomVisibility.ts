"use client";

import { useEffect } from "react";
import type { Room } from "livekit-client";

/**
 * Tab visibility for LiveKit meetings.
 * - On hide: optional privacy hook (typically mute + snapshot).
 * - On show: resume audio playback + return hook (apply admin policy).
 * Pairs with pauseVideoInBackground + disconnectOnPageLeave: false on mobile.
 */
export function useRoomVisibility(
  room: Room | undefined,
  onReturnVisible?: () => void,
  onHidden?: () => void,
) {
  useEffect(() => {
    if (!room || typeof document === "undefined") return;

    const handler = () => {
      if (document.visibilityState === "hidden") {
        onHidden?.();
        return;
      }
      if (document.visibilityState !== "visible") return;
      void room.startAudio().catch(() => undefined);
      onReturnVisible?.();
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [room, onReturnVisible, onHidden]);
}
