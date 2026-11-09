"use client";

import { useCallback, useEffect, useState } from "react";
import { useMaybeRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

export type RoomSpotlight = {
  key: string;
  by: string;
  at: number;
};

export function parseRoomSpotlight(
  metadata: string | undefined | null,
): RoomSpotlight | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { spotlight?: unknown };
    const s = parsed?.spotlight as Partial<RoomSpotlight> | null | undefined;
    if (!s || typeof s.key !== "string" || !s.key) return null;
    return {
      key: s.key,
      by: typeof s.by === "string" ? s.by : "",
      at: typeof s.at === "number" ? s.at : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Room-wide pin set by a host/moderator. Lives in LiveKit room metadata so
 * late joiners (and the live-stream recorder) pick it up on connect.
 */
export function useRoomSpotlight(opts: { roomSlug?: string } = {}) {
  const { roomSlug } = opts;
  const room = useMaybeRoomContext();
  const [spotlight, setSpotlight] = useState<RoomSpotlight | null>(() =>
    parseRoomSpotlight(room?.metadata),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!room) return;
    const sync = () => setSpotlight(parseRoomSpotlight(room.metadata));
    sync();
    room.on(RoomEvent.RoomMetadataChanged, sync);
    room.on(RoomEvent.Connected, sync);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, sync);
      room.off(RoomEvent.Connected, sync);
    };
  }, [room]);

  const setGlobal = useCallback(
    async (key: string | null): Promise<boolean> => {
      if (!roomSlug || !room) return false;
      setBusy(true);
      try {
        const res = await fetch(
          `/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/spotlight`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, by: room.localParticipant.identity }),
          },
        );
        return res.ok;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [roomSlug, room],
  );

  return { spotlight, globalKey: spotlight?.key ?? null, setGlobal, busy };
}
