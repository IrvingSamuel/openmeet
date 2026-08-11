"use client";

import { useDataChannel } from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  parseCaption,
  parseInsights,
  type Caption,
  type CopilotInsight,
} from "@/lib/captions";

export type { Caption, CopilotInsight };

function captionKey(c: Caption) {
  return `${c.speaker}\0${c.text}`;
}

export function useCaptions(meetingId?: string | null, limit = 200) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!meetingId || hydrated.current) return;
    let cancelled = false;
    fetch(`/api/transcripts?meetingId=${encodeURIComponent(meetingId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.segments) return;
        const hist: Caption[] = (
          json.segments as Array<{ speakerLabel: string; text: string }>
        ).map((s) => ({
          speaker: s.speakerLabel,
          text: s.text,
          final: true,
        }));
        hydrated.current = true;
        setCaptions((live) => {
          const seen = new Set(hist.map(captionKey));
          const merged = [
            ...hist,
            ...live.filter((c) => !seen.has(captionKey(c))),
          ];
          return merged.slice(-limit);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [meetingId, limit]);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      const caption = parseCaption(msg.payload);
      if (!caption) return;
      setCaptions((prev) => {
        const last = prev[prev.length - 1];
        if (last && captionKey(last) === captionKey(caption)) return prev;
        return [...prev, caption].slice(-limit);
      });
    },
    [limit],
  );

  useDataChannel("captions", onMessage);

  return captions;
}

export function useCopilotInsights(
  meetingId?: string | null,
  panelOpen = false,
  limit = 40,
) {
  const [insights, setInsights] = useState<CopilotInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [regenCount, setRegenCount] = useState(0);
  const hydratedForMeeting = useRef<string | null>(null);
  const nextPollAt = useRef(0);

  const applyPayload = useCallback(
    (json: {
      insights?: string[];
      observations?: string[];
      suggestions?: string[];
      cached?: boolean;
      regenCount?: number;
      nextAllowedAt?: string;
    }) => {
      const batch: CopilotInsight[] = [];
      const at = Date.now();
      for (const text of json.insights ?? []) {
        if (typeof text === "string" && text.trim())
          batch.push({ kind: "insight", text: text.trim(), at });
      }
      for (const text of json.observations ?? []) {
        if (typeof text === "string" && text.trim())
          batch.push({ kind: "observation", text: text.trim(), at });
      }
      for (const text of json.suggestions ?? []) {
        if (typeof text === "string" && text.trim())
          batch.push({ kind: "suggestion", text: text.trim(), at });
      }
      setInsights(batch.slice(-limit));
      setFromCache(Boolean(json.cached));
      if (typeof json.regenCount === "number") setRegenCount(json.regenCount);
      if (typeof json.nextAllowedAt === "string") {
        const next = Date.parse(json.nextAllowedAt);
        if (!Number.isNaN(next)) nextPollAt.current = next;
      }
    },
    [limit],
  );

  const fetchInsights = useCallback(
    async (force: boolean) => {
      if (!meetingId) return;
      setLoading(true);
      try {
        const res = await fetch("/api/meetings/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId, force }),
        });
        const json = await res.json().catch(() => null);
        if (!json) return;
        if (res.status === 429 && json.insights) {
          applyPayload(json);
          return;
        }
        if (!res.ok) return;
        applyPayload(json);
      } finally {
        setLoading(false);
      }
    },
    [meetingId, applyPayload],
  );

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      const batch = parseInsights(msg.payload);
      if (batch.length === 0) return;
      setInsights((prev) => [...prev, ...batch].slice(-limit));
      setFromCache(false);
    },
    [limit],
  );

  useDataChannel("insights", onMessage);

  // Initial load when panel opens — server returns cache if time window is fresh.
  useEffect(() => {
    if (!panelOpen || !meetingId) return;
    if (hydratedForMeeting.current === meetingId) return;
    hydratedForMeeting.current = meetingId;
    void fetchInsights(false);
  }, [panelOpen, meetingId, fetchInsights]);

  // While panel is open, poll on a 1–3 min cadence (server enforces meeting-scoped gate).
  useEffect(() => {
    if (!panelOpen || !meetingId) return;

    const tick = () => {
      const now = Date.now();
      if (now < nextPollAt.current) return;
      // Fallback poll cadence if server did not return nextAllowedAt yet.
      nextPollAt.current = now + 90_000;
      void fetchInsights(false);
    };

    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [panelOpen, meetingId, fetchInsights]);

  // Reset hydration when panel closes so reopen can refresh from cache.
  useEffect(() => {
    if (panelOpen) return;
    hydratedForMeeting.current = null;
  }, [panelOpen]);

  const refreshInsights = useCallback(() => {
    return fetchInsights(true);
  }, [fetchInsights]);

  return {
    insights,
    loading,
    fromCache,
    regenCount,
    refreshInsights,
  };
}

const POS_KEY = "openmeet:captions-pos";

type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  try {
    const raw = sessionStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    if (typeof p.x === "number" && typeof p.y === "number") return p;
  } catch {
    /* ignore */
  }
  return null;
}

export function CaptionsOverlay({
  captions,
  visible,
}: {
  captions: Caption[];
  visible: boolean;
}) {
  const t = useTranslations("room.captions");
  const uniqueRecent = (() => {
    const out: Caption[] = [];
    for (let i = captions.length - 1; i >= 0 && out.length < 2; i--) {
      const c = captions[i];
      if (out.length && captionKey(out[out.length - 1]) === captionKey(c))
        continue;
      out.unshift(c);
    }
    return out;
  })();

  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{
    ox: number;
    oy: number;
    sx: number;
    sy: number;
  } | null>(null);

  useEffect(() => {
    setPos(loadPos());
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect();
    const curX = pos?.x ?? rect.left - (parentRect?.left ?? 0);
    const curY = pos?.y ?? rect.top - (parentRect?.top ?? 0);
    drag.current = { ox: e.clientX, oy: e.clientY, sx: curX, sy: curY };
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.ox;
    const dy = e.clientY - drag.current.oy;
    setPos({ x: drag.current.sx + dx, y: drag.current.sy + dy });
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setPos((p) => {
      if (p) sessionStorage.setItem(POS_KEY, JSON.stringify(p));
      return p;
    });
  }

  function resetPos() {
    setPos(null);
    sessionStorage.removeItem(POS_KEY);
  }

  const style = pos
    ? {
        left: pos.x,
        top: pos.y,
        bottom: "auto" as const,
        transform: "none" as const,
      }
    : undefined;

  return (
    <AnimatePresence>
      {visible && uniqueRecent.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 12, filter: "blur(8px)" }}
          transition={{ duration: 0.35 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={resetPos}
          style={style}
          title={t("dragHint")}
          className={
            pos
              ? "absolute z-20 w-[min(760px,92vw)] cursor-grab touch-none space-y-1 rounded-2xl bg-black/65 px-4 py-3 text-center backdrop-blur-md active:cursor-grabbing"
              : "absolute bottom-24 left-1/2 z-20 w-[min(760px,92vw)] -translate-x-1/2 cursor-grab touch-none space-y-1 rounded-2xl bg-black/65 px-4 py-3 text-center backdrop-blur-md active:cursor-grabbing"
          }
          aria-live="polite"
        >
          <span
            aria-hidden
            className="mx-auto mb-1 block h-1 w-8 rounded-full bg-white/30"
          />
          {uniqueRecent.map((line, i) => (
            <motion.p
              key={`${line.speaker}-${line.text}-${i}`}
              layout
              initial={{ opacity: 0 }}
              animate={{
                opacity: i === uniqueRecent.length - 1 ? 1 : 0.55,
              }}
              className="pointer-events-none text-pretty text-[15px] leading-snug text-white"
            >
              <span className="font-semibold text-brand-secondary">
                {line.speaker}:{" "}
              </span>
              {line.text}
            </motion.p>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
