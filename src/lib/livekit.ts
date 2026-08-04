import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver,
} from "livekit-server-sdk";

export const AGENT_LIVEKIT_IDENTITY = "agent-chronos";

export function getLiveKitCreds() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    throw new Error("LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET required");
  }
  return { apiKey, apiSecret, url };
}

/** HTTP base for RoomService (twirp) — prefers loopback on this VPS. */
export function getLiveKitHttpHost() {
  if (process.env.LIVEKIT_HTTP_URL) return process.env.LIVEKIT_HTTP_URL;
  const { url } = getLiveKitCreds();
  if (url.includes("meet.chronos.com.pt") || url.includes("127.0.0.1")) {
    return "http://127.0.0.1:7880";
  }
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function getRoomServiceClient() {
  const { apiKey, apiSecret } = getLiveKitCreds();
  return new RoomServiceClient(getLiveKitHttpHost(), apiKey, apiSecret);
}

export type RoomMetadataPayload = {
  meetingId: string;
  roomId: string;
  slug: string;
  boardId?: string | null;
};

/** Ensure the LiveKit room exists and carries meeting metadata for the agent. */
export async function syncRoomMetadata(
  livekitRoomName: string,
  meta: RoomMetadataPayload,
) {
  const client = getRoomServiceClient();
  const metadata = JSON.stringify(meta);
  try {
    await client.createRoom({
      name: livekitRoomName,
      metadata,
      emptyTimeout: 60,
    });
  } catch {
    // Room may already exist — update metadata instead.
    await client.updateRoomMetadata(livekitRoomName, metadata);
  }
}

export type RoomRole = "host" | "participant" | "agent";

export async function mintRoomToken(opts: {
  roomName: string;
  identity: string;
  name: string;
  role: RoomRole;
  ttlSeconds?: number;
}) {
  const { apiKey, apiSecret } = getLiveKitCreds();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: opts.ttlSeconds ?? 60 * 60 * 6,
  });

  const canPublish = opts.role !== "agent";
  const roomAdmin = opts.role === "host";

  at.addGrant({
    roomJoin: true,
    room: opts.roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin,
    canUpdateOwnMetadata: true,
  });

  return at.toJwt();
}

export function getWebhookReceiver() {
  const { apiKey, apiSecret } = getLiveKitCreds();
  return new WebhookReceiver(apiKey, apiSecret);
}

export type ModerateAction = "mute" | "camera_off" | "remove";

/** Mute mic/camera or remove a participant via LiveKit RoomService. */
export async function moderateParticipant(opts: {
  livekitRoomName: string;
  identity: string;
  action: ModerateAction;
}) {
  if (
    opts.identity === AGENT_LIVEKIT_IDENTITY ||
    opts.identity.startsWith("agent-") ||
    opts.identity.startsWith("agent_")
  ) {
    throw new Error("cannot_moderate_agent");
  }

  const client = getRoomServiceClient();

  if (opts.action === "remove") {
    await client.removeParticipant(opts.livekitRoomName, opts.identity);
    return { ok: true as const };
  }

  const source =
    opts.action === "mute" ? TrackSource.MICROPHONE : TrackSource.CAMERA;
  const info = await client.getParticipant(
    opts.livekitRoomName,
    opts.identity,
  );
  const track = info.tracks.find((t) => t.source === source && !t.muted);
  if (!track?.sid) {
    return { ok: true as const, alreadyMuted: true };
  }
  await client.mutePublishedTrack(
    opts.livekitRoomName,
    opts.identity,
    track.sid,
    true,
  );
  return { ok: true as const };
}
