export type StageLayout = "grid" | "spotlight";

/** Minimal shape needed to identify a track on the stage. */
export type StageTrackLike = {
  participant: { identity: string; isLocal?: boolean };
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

/** Smallest grid tile (16:9) before the grid spills onto another page. */
export const MIN_TILE_WIDTH_PX = 240;
export const MIN_TILE_HEIGHT_PX = 135;
export const GRID_GAP_PX = 12;
export const MAX_TILES_PER_PAGE = 25;

/** How many grid tiles fit on one page without shrinking below the minimum. */
export function gridPageCapacity(
  widthPx: number,
  heightPx: number,
  {
    minWidth = MIN_TILE_WIDTH_PX,
    minHeight = MIN_TILE_HEIGHT_PX,
    gap = GRID_GAP_PX,
    max = MAX_TILES_PER_PAGE,
  } = {},
): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return max;
  const cols = Math.max(1, Math.floor((widthPx + gap) / (minWidth + gap)));
  const rows = Math.max(1, Math.floor((heightPx + gap) / (minHeight + gap)));
  return Math.max(1, Math.min(cols * rows, max));
}

/**
 * Columns for one grid page: the usual 16:9-friendly shape, widened when
 * that many rows would push tiles below the minimum height.
 */
export function pageGridColumns(
  count: number,
  widthPx: number,
  heightPx: number,
  {
    minWidth = MIN_TILE_WIDTH_PX,
    minHeight = MIN_TILE_HEIGHT_PX,
    gap = GRID_GAP_PX,
  } = {},
): number {
  const n = Math.max(count, 1);
  let cols = gridColumns(n, widthPx);
  if (!(widthPx > 0) || !(heightPx > 0)) return cols;
  const fitCols = Math.max(1, Math.floor((widthPx + gap) / (minWidth + gap)));
  const fitRows = Math.max(1, Math.floor((heightPx + gap) / (minHeight + gap)));
  while (cols < Math.min(fitCols, n) && Math.ceil(n / cols) > fitRows) {
    cols++;
  }
  return Math.max(1, Math.min(cols, n));
}

export type GridOrderOptions = {
  pinnedKey?: string | null;
  speakingIdentities?: readonly string[];
  raisedIdentities?: ReadonlySet<string>;
};

/**
 * Stable grid order so the people that matter stay on page 1:
 * pin → screen share → local → speaking / raised hand → everyone else.
 * Ties keep the incoming (join) order.
 */
export function orderForGrid<T extends StageTrackLike>(
  tracks: readonly T[],
  {
    pinnedKey = null,
    speakingIdentities = [],
    raisedIdentities = new Set<string>(),
  }: GridOrderOptions = {},
): T[] {
  const speaking = new Set(speakingIdentities);
  const rank = (t: T) => {
    if (pinnedKey && trackKey(t) === pinnedKey) return 0;
    if (t.source === "screen_share") return 1;
    if (t.participant.isLocal) return 2;
    if (
      speaking.has(t.participant.identity) ||
      raisedIdentities.has(t.participant.identity)
    ) {
      return 3;
    }
    return 4;
  };
  return tracks
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ t }) => t);
}

export function pageCount(total: number, capacity: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, capacity)));
}

/** Slice for a page; `page` is clamped into range. */
export function paginate<T>(
  list: readonly T[],
  capacity: number,
  page: number,
): { items: T[]; page: number; pages: number } {
  const size = Math.max(1, capacity);
  const pages = pageCount(list.length, size);
  const current = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  return {
    items: list.slice(current * size, current * size + size),
    page: current,
    pages,
  };
}

export type ResolveFeaturedOptions<T extends StageTrackLike> = {
  tracks: T[];
  pinnedKey: string | null;
  /** Pin set by a host/moderator for everyone; beats screen share. */
  globalPinnedKey?: string | null;
  screenShare: T | null | undefined;
  activeSpeakerIdentity: string | null;
};

/**
 * Picks the spotlight featured track:
 * global pin → screen share → pin → active speaker → first.
 * Prefers camera tracks, and remote ones in the fallback, so the spotlight
 * doesn't default to the local participant.
 */
export function resolveFeaturedTrack<T extends StageTrackLike>({
  tracks,
  pinnedKey,
  globalPinnedKey = null,
  screenShare,
  activeSpeakerIdentity,
}: ResolveFeaturedOptions<T>): T | null {
  if (tracks.length === 0) return null;
  if (globalPinnedKey) {
    const pinned = tracks.find((t) => trackKey(t) === globalPinnedKey);
    if (pinned) return pinned;
  }
  if (screenShare) return screenShare;

  if (pinnedKey) {
    const pinned = tracks.find((t) => trackKey(t) === pinnedKey);
    if (pinned) return pinned;
  }

  if (activeSpeakerIdentity) {
    const speaking =
      tracks.find(
        (t) =>
          t.participant.identity === activeSpeakerIdentity &&
          t.source === "camera",
      ) ??
      tracks.find((t) => t.participant.identity === activeSpeakerIdentity);
    if (speaking) return speaking;
  }

  return (
    tracks.find((t) => t.source === "camera" && !t.participant.isLocal) ??
    tracks.find((t) => t.source === "camera") ??
    tracks[0] ??
    null
  );
}

export const ACTIVE_SPEAKER_MIN_SPEAK_MS = 800;
export const ACTIVE_SPEAKER_HOLD_MS = 2500;

export type ActiveSpeakerState = {
  current: string | null;
  currentSince: number;
  candidate: string | null;
  candidateSince: number;
};

export const INITIAL_ACTIVE_SPEAKER_STATE: ActiveSpeakerState = {
  current: null,
  currentSince: 0,
  candidate: null,
  candidateSince: 0,
};

export type ActiveSpeakerOptions = {
  minSpeakMs?: number;
  holdMs?: number;
};

/**
 * Sticky, debounced active-speaker selection. The current speaker is kept
 * through silence; a new speaker takes over only after talking continuously
 * for `minSpeakMs`, and not before the current one has held the spotlight for
 * `holdMs` while still talking. `nextCheckAt` is when a pending candidate
 * would qualify, so callers can re-evaluate without a new speaking event.
 */
export function nextActiveSpeaker(
  state: ActiveSpeakerState,
  speakingIdentities: readonly string[],
  presentIdentities: ReadonlySet<string>,
  now: number,
  {
    minSpeakMs = ACTIVE_SPEAKER_MIN_SPEAK_MS,
    holdMs = ACTIVE_SPEAKER_HOLD_MS,
  }: ActiveSpeakerOptions = {},
): { state: ActiveSpeakerState; nextCheckAt: number | null } {
  let current = state.current;
  let currentSince = state.currentSince;
  if (current && !presentIdentities.has(current)) {
    current = null;
    currentSince = 0;
  }

  const speaking = speakingIdentities.filter((id) =>
    presentIdentities.has(id),
  );
  const top = speaking.find((id) => id !== current) ?? null;

  if (!top) {
    return {
      state: { current, currentSince, candidate: null, candidateSince: 0 },
      nextCheckAt: null,
    };
  }

  const candidateSince = top === state.candidate ? state.candidateSince : now;
  const currentTalking = current !== null && speaking.includes(current);
  const readyAt = Math.max(
    candidateSince + minSpeakMs,
    currentTalking ? currentSince + holdMs : -Infinity,
  );

  if (now >= readyAt) {
    return {
      state: {
        current: top,
        currentSince: now,
        candidate: null,
        candidateSince: 0,
      },
      nextCheckAt: null,
    };
  }

  return {
    state: { current, currentSince, candidate: top, candidateSince },
    nextCheckAt: readyAt,
  };
}
