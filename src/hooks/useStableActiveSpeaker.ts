"use client";

import { useEffect, useRef, useState } from "react";
import {
  INITIAL_ACTIVE_SPEAKER_STATE,
  nextActiveSpeaker,
  type ActiveSpeakerOptions,
} from "@/lib/stage";

/**
 * Debounced, sticky active speaker for the spotlight. `speakingIdentities`
 * should be ordered loudest first (as LiveKit reports them).
 */
export function useStableActiveSpeaker(
  speakingIdentities: readonly string[],
  presentIdentities: ReadonlySet<string>,
  options?: ActiveSpeakerOptions,
): string | null {
  const stateRef = useRef(INITIAL_ACTIVE_SPEAKER_STATE);
  const [active, setActive] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const minSpeakMs = options?.minSpeakMs;
  const holdMs = options?.holdMs;

  useEffect(() => {
    const { state, nextCheckAt } = nextActiveSpeaker(
      stateRef.current,
      speakingIdentities,
      presentIdentities,
      Date.now(),
      { minSpeakMs, holdMs },
    );
    stateRef.current = state;
    setActive(state.current);
    if (nextCheckAt === null) return;
    const timer = setTimeout(
      () => setTick((n) => n + 1),
      Math.max(0, nextCheckAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [speakingIdentities, presentIdentities, minSpeakMs, holdMs, tick]);

  return active;
}
