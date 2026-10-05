const TAB_ID_KEY = "openmeet:tab-id";

function newTabId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

/**
 * Per-tab LiveKit identity suffix, stable across reloads of the same tab.
 * Chrome "Duplicate tab" / session restore copy sessionStorage, so two tabs can
 * end up sharing it — see resetTabInstanceId.
 */
export function tabInstanceId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const id = newTabId();
    window.sessionStorage.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    return newTabId();
  }
}

/** Give this tab a fresh identity (after DUPLICATE_IDENTITY). */
export function resetTabInstanceId(): string {
  const id = newTabId();
  try {
    window.sessionStorage.setItem(TAB_ID_KEY, id);
  } catch {
    /* storage unavailable: caller still gets a fresh id for this request */
  }
  return id;
}
