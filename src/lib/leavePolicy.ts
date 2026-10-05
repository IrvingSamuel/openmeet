import type { Room } from "livekit-client";
import {
  ConnectionError,
  ConnectionErrorReason,
  DisconnectReason,
} from "livekit-client";

/**
 * A connect attempt aborted by our own `room.disconnect()` (unmount, leave,
 * error-boundary teardown). Not a network failure, so never show it to users.
 */
export function isSelfCancelledConnect(err: unknown): boolean {
  return (
    err instanceof ConnectionError &&
    err.reason === ConnectionErrorReason.Cancelled
  );
}

/** Intentional leave navigates away; unexpected disconnect stays for recovery. */
export function shouldExitMeeting(opts: {
  intentionalLeave: boolean;
}): "leave" | "recover" {
  return opts.intentionalLeave ? "leave" : "recover";
}

/**
 * Classify a LiveKit disconnect for UI routing.
 * ROOM_DELETED / PARTICIPANT_REMOVED must not offer reconnect.
 * DUPLICATE_IDENTITY must not auto-reconnect: the other tab would be kicked in
 * turn and both would ping-pong.
 */
export function disconnectOutcome(opts: {
  intentionalLeave: boolean;
  reason?: DisconnectReason | number | null;
}): "leave" | "recover" | "ended" | "removed" | "duplicate" {
  if (opts.intentionalLeave) return "leave";
  const r = opts.reason;
  if (r === DisconnectReason.ROOM_DELETED || r === 5) return "ended";
  if (r === DisconnectReason.PARTICIPANT_REMOVED || r === 4) return "removed";
  if (r === DisconnectReason.DUPLICATE_IDENTITY || r === 2) return "duplicate";
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
