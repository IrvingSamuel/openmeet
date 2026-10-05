const RELOAD_KEY = "openmeet:chunk-reload-at";
/** A second chunk failure inside this window shows the crash screen instead of looping. */
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

/**
 * True when the error comes from the browser failing to load a JS/CSS chunk,
 * which happens when a tab opened before a redeploy asks for chunk hashes the
 * new build no longer serves.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  if (typeof message !== "string") return false;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

function readLastReload(storage: Storage): number {
  const raw = storage.getItem(RELOAD_KEY);
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) ? at : 0;
}

/** Read-only: whether a chunk-error reload is allowed right now. */
export function canAutoReload(now: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    return now - readLastReload(window.sessionStorage) > RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Records the reload attempt; returns false when it must not reload again. */
export function markAutoReload(now: number = Date.now()): boolean {
  if (!canAutoReload(now)) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
