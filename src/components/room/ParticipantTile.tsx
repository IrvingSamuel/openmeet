"use client";

import {
  VideoTrack,
  isTrackReference,
  useIsMuted,
  useIsSpeaking,
  useParticipantInfo,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { cn, hueFromString, initials } from "@/lib/utils";
import { shouldRenderVideoTrack } from "@/lib/videoTrack";
import { useElementFullscreen } from "@/hooks/useElementFullscreen";
import {
  IconHand,
  IconMaximize,
  IconMicOff,
  IconMinimize,
  IconPin,
  IconScreen,
} from "@/components/ui/icons";

export { shouldRenderVideoTrack } from "@/lib/videoTrack";

export function ParticipantTile({
  trackRef,
  micRef,
  compact,
  pinned,
  onPin,
  handRaised,
  className,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  micRef?: TrackReferenceOrPlaceholder;
  compact?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  handRaised?: boolean;
  className?: string;
}) {
  const t = useTranslations("room.participantTile");
  const tLabels = useTranslations("common.labels");
  const participant = trackRef.participant;
  const info = useParticipantInfo({ participant });
  const speaking = useIsSpeaking(participant);
  const isMuted = useIsMuted(micRef ?? trackRef);

  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const isRef = isTrackReference(trackRef);
  const publicationMuted = isRef ? trackRef.publication.isMuted : true;
  const showVideo = shouldRenderVideoTrack({
    isTrackReference: isRef,
    isMuted: publicationMuted,
  });
  // Waiting for the first frames of a screen share that already published.
  const screenStarting =
    isScreenShare && isRef && !publicationMuted && !trackRef.publication.track;

  const name = info.name || participant.identity;
  const hue = hueFromString(participant.identity);
  const { ref: tileRef, active: fullscreen, toggle: toggleFullscreen } =
    useElementFullscreen<HTMLDivElement>();

  function handleDoubleClick() {
    if (isScreenShare) {
      void toggleFullscreen();
      return;
    }
    onPin?.();
  }

  return (
    // No layoutId here — morphing remounts the <video> and kills adaptiveStream.
    <div
      ref={tileRef}
      onDoubleClick={handleDoubleClick}
      data-testid="participant-tile"
      data-has-video={showVideo ? "true" : "false"}
      data-fullscreen={fullscreen ? "true" : "false"}
      className={cn(
        "group relative z-0 min-h-0 min-w-0 overflow-hidden rounded-2xl border bg-black",
        "[&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:bg-black",
        handRaised && !isScreenShare
          ? "border-amber-400/85 shadow-[0_0_0_1px_rgb(251_191_36/0.7),0_0_48px_-12px_rgb(251_191_36/0.55)]"
          : speaking && !isScreenShare
            ? "border-brand-secondary/80 shadow-[0_0_0_1px_var(--brand-secondary),0_0_50px_-14px_var(--brand-secondary)]"
            : "border-line",
        className,
      )}
      style={
        showVideo
          ? undefined
          : {
              background: `radial-gradient(120% 120% at 30% 12%, hsl(${hue} 58% 24%), hsl(${hue} 52% 9%))`,
            }
      }
    >
      {showVideo && isRef ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn(
            "h-full w-full",
            isScreenShare ? "object-contain" : "object-cover",
            !isScreenShare && participant.isLocal && "-scale-x-100",
          )}
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          {screenStarting ? (
            <p className="px-3 text-center text-xs text-ink-muted">
              {t("screenShare")}…
            </p>
          ) : (
            <motion.span
              animate={speaking ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={{ duration: 1.2, repeat: speaking ? Infinity : 0 }}
              className={cn(
                "grid place-items-center rounded-full bg-white/12 font-semibold text-white/95 backdrop-blur",
                compact ? "h-10 w-10 text-xs" : "h-20 w-20 text-xl",
              )}
            >
              {initials(name)}
            </motion.span>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
          {isScreenShare ? (
            <IconScreen className="h-3 w-3 shrink-0 text-brand-secondary" />
          ) : isMuted ? (
            <IconMicOff className="h-3 w-3 shrink-0 text-rose-300" />
          ) : (
            <SpeakingDots active={speaking} />
          )}
          <span className="truncate">
            {name}
            {isScreenShare ? ` · ${tLabels("screen").toLowerCase()}` : ""}
            {participant.isLocal && !isScreenShare
              ? ` ${tLabels("youParen")}`
              : ""}
          </span>
        </span>
      </div>

      {handRaised && !isScreenShare ? (
        <span
          className="pointer-events-none absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-amber-400/50 bg-amber-500/25 text-amber-200 backdrop-blur"
          title={t("handRaised")}
        >
          <IconHand className="h-4 w-4" />
        </span>
      ) : null}

      {onPin && !isScreenShare ? (
        <button
          onClick={onPin}
          aria-label={pinned ? t("unpin") : t("pin")}
          className={cn(
            "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/55 text-white/80 backdrop-blur transition-all duration-200",
            "opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 focus-visible:opacity-100",
            pinned && "border-brand-secondary/60 text-brand-secondary opacity-100",
          )}
        >
          <IconPin className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {isScreenShare && showVideo ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleFullscreen();
          }}
          aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
          className={cn(
            "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/55 text-white/80 backdrop-blur transition-all duration-200",
            "opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 focus-visible:opacity-100",
            fullscreen && "border-brand-secondary/60 text-brand-secondary opacity-100",
          )}
        >
          {fullscreen ? (
            <IconMinimize className="h-3.5 w-3.5" />
          ) : (
            <IconMaximize className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
}

function SpeakingDots({ active }: { active: boolean }) {
  return (
    <span className="flex h-3 w-3 shrink-0 items-end justify-center gap-[2px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn(
            "w-[2px] rounded-full",
            active ? "bg-brand-secondary" : "bg-white/40",
          )}
          animate={active ? { height: [3, 9, 3] } : { height: 3 }}
          transition={{
            duration: 0.7,
            repeat: active ? Infinity : 0,
            delay: i * 0.12,
          }}
        />
      ))}
    </span>
  );
}
