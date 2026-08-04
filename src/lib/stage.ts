export type StageLayout = "grid" | "spotlight";

/** Minimal shape needed to identify a track on the stage. */
export type StageTrackLike = {
  participant: { identity: string };
  source: string;
};

export function trackKey(ref: StageTrackLike): string {
  return `${ref.participant.identity}:${ref.source}`;
}

/**
 * Columns that keep tiles closest to 16:9 for a given participant count,
 * capped by stage width so phones never get unreadable micro-tiles.
 */
export function gridColumns(count: number, widthPx = Infinity): number {
  const byCount =
    count <= 1
      ? 1
      : count <= 4
        ? 2
        : count <= 9
          ? 3
          : count <= 16
            ? 4
            : 5;

  const maxByWidth =
    widthPx < 400 ? 1 : widthPx < 700 ? 2 : widthPx < 1100 ? 3 : 5;

  return Math.min(byCount, maxByWidth, Math.max(count, 1));
}

export type ResolveFeaturedOptions<T extends StageTrackLike> = {
  tracks: T[];
  pinnedKey: string | null;
  screenShare: T | null | undefined;
  speakingIdentities: readonly string[];
};

/**
 * Picks the spotlight featured track: screen share → pin → active speaker → first.
 * Prefers camera tracks when resolving speaker / first fallbacks.
 */
export function resolveFeaturedTrack<T extends StageTrackLike>({
  tracks,
  pinnedKey,
  screenShare,
  speakingIdentities,
}: ResolveFeaturedOptions<T>): T | null {
  if (tracks.length === 0) return null;
  if (screenShare) return screenShare;

  if (pinnedKey) {
    const pinned = tracks.find((t) => trackKey(t) === pinnedKey);
    if (pinned) return pinned;
  }

  for (const identity of speakingIdentities) {
    const speaking =
      tracks.find(
        (t) =>
          t.participant.identity === identity && t.source === "camera",
      ) ?? tracks.find((t) => t.participant.identity === identity);
    if (speaking) return speaking;
  }

  return (
    tracks.find((t) => t.source === "camera") ?? tracks[0] ?? null
  );
}
