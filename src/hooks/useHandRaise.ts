"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RoomEvent,
  type Participant,
  type RemoteParticipant,
  type Room,
} from "livekit-client";
import { HAND_RAISED_ATTR, isHandRaised } from "@/lib/hand-raise";
import { playHandRaiseChime } from "@/lib/recording-beep";

function collectRaised(room: Room): Set<string> {
  const set = new Set<string>();
  if (isHandRaised(room.localParticipant)) {
    set.add(room.localParticipant.identity);
  }
  for (const p of room.remoteParticipants.values()) {
    if (isHandRaised(p)) set.add(p.identity);
  }
  return set;
}

export function useHandRaise(room: Room | undefined) {
  const [raisedIdentities, setRaisedIdentities] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const initialSyncDone = useRef(false);

  useEffect(() => {
    if (!room) {
      setRaisedIdentities(new Set());
      initialSyncDone.current = false;
      return;
    }

    const syncAll = () => {
      setRaisedIdentities(collectRaised(room));
    };

    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      syncAll();
    }

    const onAttributesChanged = (
      changed: Record<string, string>,
      participant: Participant,
    ) => {
      if (!(HAND_RAISED_ATTR in changed)) return;

      const raised = changed[HAND_RAISED_ATTR] === "1";
      setRaisedIdentities((prev) => {
        const next = new Set(prev);
        if (raised) next.add(participant.identity);
        else next.delete(participant.identity);
        return next;
      });

      // Remote raises only — local chime plays in toggleHand (user gesture).
      if (!participant.isLocal && raised) {
        playHandRaiseChime();
      }
    };

    const onParticipantConnected = (_p: RemoteParticipant) => {
      syncAll();
    };

    const onParticipantDisconnected = (p: RemoteParticipant) => {
      setRaisedIdentities((prev) => {
        if (!prev.has(p.identity)) return prev;
        const next = new Set(prev);
        next.delete(p.identity);
        return next;
      });
    };

    // Room-level event covers local + all remotes (including late joiners).
    room.on(RoomEvent.ParticipantAttributesChanged, onAttributesChanged);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, onAttributesChanged);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [room]);

  const localHandRaised = room
    ? raisedIdentities.has(room.localParticipant.identity)
    : false;

  const toggleHand = useCallback(async () => {
    if (!room) return;
    const next = !localHandRaised;
    // Play in the user gesture so mobile AudioContext unlocks and the raiser hears confirmation.
    if (next) playHandRaiseChime();
    await room.localParticipant.setAttributes({
      [HAND_RAISED_ATTR]: next ? "1" : "",
    });
  }, [room, localHandRaised]);

  return { raisedIdentities, localHandRaised, toggleHand };
}
