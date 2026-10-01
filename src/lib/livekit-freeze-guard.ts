import type { Room } from "livekit-client";

/**
 * livekit-client registers `window.addEventListener('freeze', room.onPageLeave)`
 * on every successful connect, regardless of `disconnectOnPageLeave`
 * (livekit/client-sdk-js#1968, intentional upstream). Only Chromium fires
 * `freeze` (Memory/Energy Saver, background tab freezing), so Chrome users get
 * silently disconnected. `onPageLeave` is private; guard against it vanishing.
 */
export function detachFreezeDisconnect(room: Room): boolean {
  if (typeof window === "undefined") return false;
  const handler = (room as unknown as { onPageLeave?: unknown }).onPageLeave;
  if (typeof handler !== "function") return false;
  window.removeEventListener("freeze", handler as EventListener);
  return true;
}
