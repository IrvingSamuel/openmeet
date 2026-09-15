"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  coerceMediaPrefs,
  DEFAULT_MEDIA_PREFS,
  MEDIA_PREFS_STORAGE_KEY,
  type MediaPrefs,
  type MediaPrefsFieldsInput,
} from "@/lib/media-prefs-schema";

function readLocal(): MediaPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_MEDIA_PREFS };
  try {
    const raw = window.localStorage.getItem(MEDIA_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MEDIA_PREFS };
    return coerceMediaPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MEDIA_PREFS };
  }
}

function writeLocal(prefs: MediaPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MEDIA_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota / private mode
  }
}

/**
 * Load and persist media effect prefs: account API when logged in,
 * otherwise localStorage (`openmeet:media-prefs`).
 */
export function useMediaPrefs() {
  const [prefs, setPrefs] = useState<MediaPrefs>(DEFAULT_MEDIA_PREFS);
  const [ready, setReady] = useState(false);
  const [accountBound, setAccountBound] = useState(false);
  const [saving, setSaving] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountBoundRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = readLocal();
      try {
        const res = await fetch("/api/me/media-prefs", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          accountBoundRef.current = false;
          setAccountBound(false);
          setPrefs(local);
          setReady(true);
          return;
        }
        if (!res.ok) {
          accountBoundRef.current = false;
          setAccountBound(false);
          setPrefs(local);
          setReady(true);
          return;
        }
        const data = (await res.json()) as { prefs?: unknown };
        const next = coerceMediaPrefs(data.prefs);
        accountBoundRef.current = true;
        setAccountBound(true);
        setPrefs(next);
        writeLocal(next);
      } catch {
        if (cancelled) return;
        accountBoundRef.current = false;
        setAccountBound(false);
        setPrefs(local);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const persist = useCallback(async (next: MediaPrefs) => {
    writeLocal(next);
    if (!accountBoundRef.current) return;
    setSaving(true);
    try {
      const body: MediaPrefsFieldsInput = {
        videoEffect: next.videoEffect,
        blurRadius: next.blurRadius,
        virtualBackgroundUrl: next.virtualBackgroundUrl,
        noiseSuppression: next.noiseSuppression,
        echoCancellation: next.echoCancellation,
        autoGainControl: next.autoGainControl,
      };
      await fetch("/api/me/media-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // keep local copy
    } finally {
      setSaving(false);
    }
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<MediaPrefs>) => {
      const next = { ...prefsRef.current, ...patch };
      setPrefs(next);
      prefsRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persist(next);
      }, 400);
    },
    [persist],
  );

  const uploadVirtualBackground = useCallback(async (file: File) => {
    const form = new FormData();
    form.set("kind", "virtual-bg");
    form.set("file", file);
    const res = await fetch("/api/me/media-prefs/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(data?.error || "upload_failed");
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  }, []);

  return {
    prefs,
    ready,
    accountBound,
    saving,
    updatePrefs,
    uploadVirtualBackground,
  };
}
