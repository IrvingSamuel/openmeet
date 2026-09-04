"use client";

import {
  useSpeakingParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { morphTransition } from "@/components/motion/primitives";
import { ParticipantTile } from "@/components/room/ParticipantTile";
import {
  gridColumns,
  resolveFeaturedTrack,
  trackKey,
  type StageLayout,
} from "@/lib/stage";
import { isAgentParticipant } from "@/lib/participants";

export type { StageLayout };

export function Stage({
  layout,
  pinnedKey,
  onPin,
  raisedIdentities = new Set<string>(),
}: {
  layout: StageLayout;
  pinnedKey: string | null;
  onPin: (key: string | null) => void;
  raisedIdentities?: ReadonlySet<string>;
}) {
  const t = useTranslations("room");
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number" && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 1200);
    return () => ro.disconnect();
  }, []);

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const tracks = useMemo(
    () => allTracks.filter((t) => !isAgentParticipant(t.participant)),
    [allTracks],
  );

  const micTracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  const micByIdentity = useMemo(() => {
    const map = new Map<string, TrackReferenceOrPlaceholder>();
    for (const ref of micTracks) map.set(ref.participant.identity, ref);
    return map;
  }, [micTracks]);

  const speakingParticipants = useSpeakingParticipants();
  const speakingIdentities = useMemo(
    () =>
      speakingParticipants
        .filter((p) => !isAgentParticipant(p))
        .map((p) => p.identity),
    [speakingParticipants],
  );

  const screenShare = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && t.publication,
  );

  const featured = useMemo(
    () =>
      resolveFeaturedTrack({
        tracks,
        pinnedKey,
        screenShare,
        speakingIdentities,
      }),
    [tracks, pinnedKey, screenShare, speakingIdentities],
  );

  // Drop stale pin when the pinned track leaves the stage.
  useEffect(() => {
    if (!pinnedKey) return;
    if (!tracks.some((t) => trackKey(t) === pinnedKey)) {
      onPin(null);
    }
  }, [tracks, pinnedKey, onPin]);

  const others = featured
    ? tracks.filter((t) => trackKey(t) !== trackKey(featured))
    : tracks;

  if (tracks.length === 0) {
    return (
      <div
        ref={rootRef}
        className="relative z-0 grid h-full place-items-center text-sm text-ink-faint"
      >
        {t("waitingForParticipants")}
      </div>
    );
  }

  if (layout === "spotlight" && featured) {
    return (
      <motion.div
        ref={rootRef}
        layout
        transition={morphTransition}
        className="relative z-0 flex h-full flex-col gap-3 lg:flex-row"
      >
        <ParticipantTile
          trackRef={featured}
          micRef={micByIdentity.get(featured.participant.identity)}
          pinned={pinnedKey === trackKey(featured)}
          handRaised={raisedIdentities.has(featured.participant.identity)}
          onPin={() =>
            onPin(pinnedKey === trackKey(featured) ? null : trackKey(featured))
          }
          className="min-h-0 flex-1"
        />
        {others.length > 0 ? (
          <motion.div
            layout
            transition={morphTransition}
            className="flex shrink-0 gap-3 overflow-auto no-scrollbar lg:w-[clamp(180px,20vw,260px)] lg:flex-col"
          >
            {others.map((ref) => (
              <ParticipantTile
                key={trackKey(ref)}
                trackRef={ref}
                micRef={micByIdentity.get(ref.participant.identity)}
                compact
                pinned={pinnedKey === trackKey(ref)}
                handRaised={raisedIdentities.has(ref.participant.identity)}
                onPin={() => onPin(trackKey(ref))}
                className="aspect-video h-24 shrink-0 lg:h-auto lg:w-full"
              />
            ))}
          </motion.div>
        ) : null}
      </motion.div>
    );
  }

  const columns = gridColumns(tracks.length, width);

  return (
    <motion.div
      ref={rootRef}
      layout
      transition={morphTransition}
      className={cn("relative z-0 grid h-full auto-rows-fr gap-2 sm:gap-3")}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {tracks.map((ref) => (
        <ParticipantTile
          key={trackKey(ref)}
          trackRef={ref}
          micRef={micByIdentity.get(ref.participant.identity)}
          pinned={pinnedKey === trackKey(ref)}
          handRaised={raisedIdentities.has(ref.participant.identity)}
          onPin={() => onPin(trackKey(ref))}
        />
      ))}
    </motion.div>
  );
}
