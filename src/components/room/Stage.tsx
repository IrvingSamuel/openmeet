"use client";

import {
  useSpeakingParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { morphTransition } from "@/components/motion/primitives";
import { ParticipantTile } from "@/components/room/ParticipantTile";
import { IconChevronDown } from "@/components/ui/icons";
import {
  gridPageCapacity,
  orderForGrid,
  pageGridColumns,
  paginate,
  resolveFeaturedTrack,
  trackKey,
  type StageLayout,
} from "@/lib/stage";
import { isAgentParticipant } from "@/lib/participants";
import { useModerateParticipant } from "@/hooks/useModerateParticipant";
import { useStableActiveSpeaker } from "@/hooks/useStableActiveSpeaker";

export type { StageLayout };

/** Grace before a moderator clears a global pin whose participant left. */
const STALE_GLOBAL_PIN_MS = 5000;

export function Stage({
  layout,
  pinnedKey,
  onPin,
  globalPinnedKey = null,
  onGlobalPin,
  globalPinBusy = false,
  layoutLocked = false,
  raisedIdentities = new Set<string>(),
  canModerate = false,
  roomSlug,
  meetingId,
  readOnly = false,
}: {
  layout: StageLayout;
  pinnedKey: string | null;
  onPin?: (key: string | null) => void;
  /** Pin set by a host/moderator for everyone (room metadata). */
  globalPinnedKey?: string | null;
  /** Moderators only: set/clear the pin for everyone. */
  onGlobalPin?: (key: string | null) => void;
  globalPinBusy?: boolean;
  /** A moderator pinned someone for everyone; local pinning is disabled. */
  layoutLocked?: boolean;
  raisedIdentities?: ReadonlySet<string>;
  canModerate?: boolean;
  roomSlug?: string;
  meetingId?: string;
  /** Spectator / live-stream view: no pin, no moderation, no tile buttons. */
  readOnly?: boolean;
}) {
  const { moderate, busyIdentity } = useModerateParticipant({
    roomSlug,
    meetingId,
    enabled: canModerate && !readOnly,
  });
  const pin = readOnly || layoutLocked || globalPinnedKey ? undefined : onPin;
  const globalPin = readOnly || !canModerate ? undefined : onGlobalPin;
  const t = useTranslations("room");
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 675 });
  const [page, setPage] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    ro.observe(el);
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    }
    return () => ro.disconnect();
  }, []);

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // In read-only mode the local participant is the hidden Egress recorder.
  const tracks = useMemo(
    () =>
      allTracks.filter(
        (t) =>
          !isAgentParticipant(t.participant) &&
          !(readOnly && t.participant.isLocal),
      ),
    [allTracks, readOnly],
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
  const speakingKey = speakingParticipants
    .filter((p) => !p.isLocal && !isAgentParticipant(p))
    .map((p) => p.identity)
    .join("\n");
  const speakingIdentities = useMemo(
    () => (speakingKey ? speakingKey.split("\n") : []),
    [speakingKey],
  );

  const presentKey = tracks
    .filter((t) => !t.participant.isLocal)
    .map((t) => t.participant.identity)
    .join("\n");
  const presentIdentities = useMemo(
    () => new Set(presentKey ? presentKey.split("\n") : []),
    [presentKey],
  );

  const activeSpeakerIdentity = useStableActiveSpeaker(
    speakingIdentities,
    presentIdentities,
  );

  const screenShare = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && t.publication,
  );

  const featured = useMemo(
    () =>
      resolveFeaturedTrack({
        tracks,
        pinnedKey,
        globalPinnedKey,
        screenShare,
        activeSpeakerIdentity,
      }),
    [tracks, pinnedKey, globalPinnedKey, screenShare, activeSpeakerIdentity],
  );

  // Drop stale pin when the pinned track leaves the stage.
  useEffect(() => {
    if (!pinnedKey || !onPin) return;
    if (!tracks.some((t) => trackKey(t) === pinnedKey)) {
      onPin(null);
    }
  }, [tracks, pinnedKey, onPin]);

  // Only clear a global pin once its participant was seen and then left, so a
  // moderator joining (empty stage while connecting) never wipes it.
  const globalPinnedPresent = Boolean(
    globalPinnedKey && tracks.some((t) => trackKey(t) === globalPinnedKey),
  );
  const seenGlobalPinRef = useRef<string | null>(null);
  useEffect(() => {
    if (!globalPinnedKey) {
      seenGlobalPinRef.current = null;
      return;
    }
    if (globalPinnedPresent) {
      seenGlobalPinRef.current = globalPinnedKey;
      return;
    }
    if (!globalPin || seenGlobalPinRef.current !== globalPinnedKey) return;
    const timer = window.setTimeout(
      () => globalPin(null),
      STALE_GLOBAL_PIN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [globalPinnedKey, globalPinnedPresent, globalPin]);

  const capacity = gridPageCapacity(size.width, size.height);
  const effectivePinKey = globalPinnedKey ?? pinnedKey;
  const multiPage = tracks.length > capacity;
  const ordered = useMemo(
    () =>
      // Reordering only matters (and only moves tiles) when paginated.
      multiPage
        ? orderForGrid(tracks, {
            pinnedKey: effectivePinKey,
            speakingIdentities: activeSpeakerIdentity
              ? [activeSpeakerIdentity]
              : [],
            raisedIdentities,
          })
        : tracks,
    [multiPage, tracks, effectivePinKey, activeSpeakerIdentity, raisedIdentities],
  );
  const paged = paginate(ordered, capacity, page);

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page);
  }, [page, paged.page]);

  const others = featured
    ? tracks.filter((t) => trackKey(t) !== trackKey(featured))
    : tracks;

  function tileProps(ref: TrackReferenceOrPlaceholder) {
    const key = trackKey(ref);
    const isGlobal = globalPinnedKey === key;
    return {
      trackRef: ref,
      micRef: micByIdentity.get(ref.participant.identity),
      pinned: pinnedKey === key,
      globalPinned: isGlobal,
      onGlobalPin: globalPin
        ? () => globalPin(isGlobal ? null : key)
        : undefined,
      globalPinBusy,
      handRaised: raisedIdentities.has(ref.participant.identity),
      readOnly,
      canModerate,
      onMute: () => void moderate(ref.participant.identity, "mute"),
      onCameraOff: () => void moderate(ref.participant.identity, "camera_off"),
      moderationBusy: busyIdentity?.startsWith(ref.participant.identity),
    };
  }

  let content: ReactNode;

  if (tracks.length === 0) {
    content = (
      <div className="grid h-full place-items-center text-sm text-ink-faint">
        {t("waitingForParticipants")}
      </div>
    );
  } else if (layout === "spotlight" && featured) {
    const featuredKey = trackKey(featured);
    content = (
      <motion.div
        layout
        transition={morphTransition}
        className="flex h-full flex-col gap-3 lg:flex-row"
      >
        <ParticipantTile
          {...tileProps(featured)}
          onPin={
            pin
              ? () => pin(pinnedKey === featuredKey ? null : featuredKey)
              : undefined
          }
          className="min-h-0 flex-1"
        />
        {others.length > 0 ? (
          <motion.div
            layout
            transition={morphTransition}
            className="flex shrink-0 gap-3 overflow-auto no-scrollbar lg:w-[clamp(240px,20vw,280px)] lg:flex-col"
          >
            {others.map((ref) => (
              <ParticipantTile
                key={trackKey(ref)}
                {...tileProps(ref)}
                compact
                onPin={pin ? () => pin(trackKey(ref)) : undefined}
                className="aspect-video h-24 min-w-[171px] shrink-0 lg:h-auto lg:w-full"
              />
            ))}
          </motion.div>
        ) : null}
      </motion.div>
    );
  } else {
    const columns = pageGridColumns(
      paged.items.length,
      size.width,
      size.height,
    );
    content = (
      <>
        <motion.div
          layout
          transition={morphTransition}
          className={cn("grid h-full auto-rows-fr gap-2 sm:gap-3")}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {paged.items.map((ref) => (
            <ParticipantTile
              key={trackKey(ref)}
              {...tileProps(ref)}
              onPin={pin ? () => pin(trackKey(ref)) : undefined}
            />
          ))}
        </motion.div>
        {paged.pages > 1 ? (
          <div
            data-testid="stage-pager"
            className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center"
          >
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/15 bg-black/60 p-1 text-xs text-white/90 backdrop-blur">
              <button
                type="button"
                onClick={() => setPage(paged.page - 1)}
                disabled={paged.page === 0}
                aria-label={t("stage.previousPage")}
                className="grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <IconChevronDown className="h-4 w-4 rotate-90" />
              </button>
              <span className="px-1 tabular-nums">
                {t("stage.pageOf", {
                  current: paged.page + 1,
                  total: paged.pages,
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage(paged.page + 1)}
                disabled={paged.page >= paged.pages - 1}
                aria-label={t("stage.nextPage")}
                className="grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <IconChevronDown className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div ref={rootRef} className="relative z-0 h-full min-h-0">
      {content}
    </div>
  );
}
