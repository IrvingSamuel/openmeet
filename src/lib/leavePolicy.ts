import type { Room } from "livekit-client";
import { DisconnectReason } from "livekit-client";

/** Intentional leave navigates away; unexpected disconnect stays for recovery. */
export function shouldExitMeeting(opts: {
  intentionalLeave: boolean;
}): "leave" | "recover" {
  return opts.intentionalLeave ? "leave" : "recover";
}

/**
 * Classify a LiveKit disconnect for UI routing.
 * ROOM_DELETED / PARTICIPANT_REMOVED must not offer reconnect.
 */
export function disconnectOutcome(opts: {
  intentionalLeave: boolean;
  reason?: DisconnectReason | number | null;
}): "leave" | "recover" | "ended" | "removed" {
  if (opts.intentionalLeave) return "leave";
  const r = opts.reason;
  if (r === DisconnectReason.ROOM_DELETED || r === 5) return "ended";
  if (r === DisconnectReason.PARTICIPANT_REMOVED || r === 4) return "removed";
  return "recover";
}

/** Turn off cam/mic/screen and stop underlying MediaStreamTracks before leave. */
export async function releaseLocalMedia(room: Room): Promise<void> {
  const lp = room.localParticipant;
  await Promise.allSettled([
    lp.setCameraEnabled(false),
    lp.setMicrophoneEnabled(false),
    lp.setScreenShareEnabled(false),
  ]);
  for (const pub of lp.trackPublications.values()) {
    try {
      pub.track?.stop();
      pub.track?.mediaStreamTrack?.stop();
    } catch {
      /* already stopped */
    }
  }
}
