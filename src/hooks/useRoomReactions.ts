"use client";

import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  burstFromEvent,
  encodeReaction,
  newReactionId,
  parseReaction,
  REACTION_RATE_LIMIT_MS,
  REACTIONS_TOPIC,
  sanitizeEmoji,
  type ReactionBurst,
  type ReactionEvent,
} from "@/lib/room-reactions";

const MAX_BURST = 16;
const REMOVE_BUFFER_MS = 200;

function payloadToBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  return null;
}

export function useRoomReactions() {
  const room = useRoomContext();
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const lastSendAt = useRef(0);
  const removeTimers = useRef<Map<string, number>>(new Map());

  const appendBurst = useCallback((event: ReactionEvent) => {
    if (seenIds.current.has(event.id)) return;
    seenIds.current.add(event.id);
    const burst = burstFromEvent(event);

    setBursts((prev) => {
      const next = [...prev, burst];
      if (next.length > MAX_BURST) {
        return next.slice(next.length - MAX_BURST);
      }
      return next;
    });

    const timer = window.setTimeout(() => {
      removeTimers.current.delete(burst.id);
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, burst.duration * 1000 + REMOVE_BUFFER_MS);
    removeTimers.current.set(burst.id, timer);
  }, []);

  useEffect(() => {
    const onData = (
      payload: unknown,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== REACTIONS_TOPIC) return;
      try {
        const bytes = payloadToBytes(payload);
        if (!bytes) return;
        const event = parseReaction(bytes);
        if (!event) return;
        appendBurst(event);
      } catch {
        /* ignore malformed frames */
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      for (const t of removeTimers.current.values()) window.clearTimeout(t);
      removeTimers.current.clear();
      seenIds.current.clear();
    };
  }, [room, appendBurst]);

  const sendReaction = useCallback(
    async (emojiInput: string) => {
      const emoji = sanitizeEmoji(emojiInput);
      if (!emoji) return false;

      const now = Date.now();
      if (now - lastSendAt.current < REACTION_RATE_LIMIT_MS) return false;
      lastSendAt.current = now;

      const lp = room.localParticipant;
      const event: ReactionEvent = {
        id: newReactionId(),
        emoji,
        displayName: lp.name || lp.identity,
        identity: lp.identity,
        at: now,
      };

      appendBurst(event);

      const data = Uint8Array.from(encodeReaction(event));
      try {
        await lp.publishData(data, {
          reliable: false,
          topic: REACTIONS_TOPIC,
        });
        return true;
      } catch {
        return false;
      }
    },
    [room, appendBurst],
  );

  return { bursts, sendReaction };
}
