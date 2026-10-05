import type { ScreenShareCaptureOptions } from "livekit-client";

/** Capture options for LiveKit screen share (maps to getDisplayMedia). */
export function screenShareCaptureOptions(
  withAudio: boolean,
): ScreenShareCaptureOptions {
  if (!withAudio) {
    return { audio: false };
  }
  return {
    audio: true,
    systemAudio: "include",
  };
}
