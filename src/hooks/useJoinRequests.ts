"use client";

import { useCallback, useEffect, useState } from "react";

export type JoinRequest = {
  id: string;
  displayName: string;
  createdAt: string;
};

const POLL_MS = 2500;

export function useJoinRequests(roomSlug: string | undefined, enabled: boolean) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !roomSlug) {
      setRequests([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/join-requests`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setRequests(json.requests ?? []);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomSlug, enabled]);

  const decide = useCallback(
    async (id: string, decision: "approve" | "deny") => {
      if (!roomSlug) return false;
      setBusyId(id);
      try {
        const res = await fetch(
          `/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/join-requests/${id}/${decision}`,
          { method: "POST" },
        );
        if (!res.ok) return false;
        setRequests((prev) => prev.filter((r) => r.id !== id));
        return true;
      } catch {
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [roomSlug],
  );

  return { requests, busyId, decide };
}
