"use client";

import { useEffect } from "react";
import type { Room } from "livekit-client";

/**
 * When the tab returns visible, resume LiveKit audio *playback* only.
 * Local mic/camera are left to the caller (privacy: typically mute on return).
 * Pairs with pauseVideoInBackground + disconnectOnPageLeave: false on mobile.
 */
export function useRoomVisibility(
  room: Room | undefined,
  onReturnVisible?: () => void,
) {
  useEffect(() => {
    if (!room || typeof document === "undefined") return;

    const handler = () => {
      if (document.visibilityState !== "visible") return;
      void room.startAudio().catch(() => undefined);
      onReturnVisible?.();
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [room, onReturnVisible]);
}
