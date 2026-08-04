"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn, hueFromString, initials } from "@/lib/utils";
import { morphTransition, springSoft } from "@/components/motion/primitives";
import {
  IconCaptions,
  IconMic,
  IconMicOff,
  IconPhoneOff,
  IconScreen,
  IconVideo,
} from "@/components/ui/icons";

/**
 * Self-playing miniature of the meeting UI. Drives the same layoutId morph
 * used by the real room so the marketing demo matches the product.
 */
export function RoomPreview({ className }: { className?: string }) {
  const t = useTranslations("landing.roomPreview");
  const reduced = useReducedMotion();
  const [speakerIndex, setSpeakerIndex] = useState(0);
  const [mode, setMode] = useState<"grid" | "spotlight">("spotlight");
  const [captionIndex, setCaptionIndex] = useState(0);

  const people = [
    { id: "ana", name: t("speakerAna"), muted: false },
    { id: "caio", name: t("speakerCaio"), muted: true },
    { id: "duda", name: t("speakerDuda"), muted: false },
    { id: "ivo", name: t("speakerIvo"), muted: false },
    { id: "lia", name: t("speakerLia"), muted: true },
  ];

  const script = [
    { speaker: t("script1Speaker"), text: t("script1Text") },
    { speaker: t("script2Speaker"), text: t("script2Text") },
    { speaker: t("script3Speaker"), text: t("script3Text") },
    { speaker: t("script4Speaker"), text: t("script4Text") },
  ];

  useEffect(() => {
    if (reduced) return;
    const speak = setInterval(
      () => setSpeakerIndex((i) => (i + 1) % 5),
      3400,
    );
    const layout = setInterval(
      () => setMode((m) => (m === "grid" ? "spotlight" : "grid")),
      7200,
    );
    const caption = setInterval(
      () => setCaptionIndex((i) => (i + 1) % 4),
      3400,
    );
    return () => {
      clearInterval(speak);
      clearInterval(layout);
      clearInterval(caption);
    };
  }, [reduced]);

  const active = people[speakerIndex];
  const others = people.filter((p) => p.id !== active.id);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] glass-strong p-3 shadow-lift",
        className,
      )}
      aria-label={t("ariaLabel")}
    >
      <div
        aria-hidden
        className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-brand-secondary to-transparent"
      />

      <div className="mb-3 flex items-center justify-between px-1.5 pt-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-400/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/70" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            {t("demoUrl")}
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium text-rose-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
          {t("recording")}
        </span>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-black/50">
        <motion.div
          layout
          transition={morphTransition}
          className={cn(
            "absolute inset-0 gap-2 p-2",
            mode === "grid"
              ? "grid grid-cols-3 grid-rows-2"
              : "flex flex-col sm:flex-row",
          )}
        >
          <Tile
            person={active}
            speaking
            className={mode === "spotlight" ? "flex-1" : ""}
          />
          <motion.div
            layout
            transition={morphTransition}
            className={cn(
              mode === "spotlight"
                ? "flex w-full shrink-0 gap-2 sm:w-[26%] sm:flex-col"
                : "contents",
            )}
          >
            {others.map((p) => (
              <Tile key={p.id} person={p} compact={mode === "spotlight"} />
            ))}
          </motion.div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={captionIndex}
            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ duration: 0.45 }}
            className="absolute bottom-3 left-0 w-[86%] -translate-x-1/2 rounded-xl bg-black/70 px-3 py-2 text-center text-[11px] leading-snug text-white/90 backdrop-blur-md"
          >
            <span className="font-semibold text-brand-secondary">
              {script[captionIndex].speaker}:{" "}
            </span>
            {script[captionIndex].text}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 pb-1">
        {[IconMic, IconVideo, IconScreen, IconCaptions].map((Icon, i) => (
          <motion.span
            key={i}
            whileHover={{ y: -3 }}
            transition={springSoft}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/[0.06] text-ink-muted"
          >
            <Icon className="h-4 w-4" />
          </motion.span>
        ))}
        <span className="grid h-9 w-12 place-items-center rounded-xl bg-rose-500/90 text-white">
          <IconPhoneOff className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function Tile({
  person,
  speaking,
  compact,
  className,
}: {
  person: { id: string; name: string; muted: boolean };
  speaking?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const hue = hueFromString(person.id);
  return (
    <motion.div
      layoutId={`preview-${person.id}`}
      layout
      transition={morphTransition}
      className={cn(
        "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border",
        speaking
          ? "border-brand-secondary/70 shadow-[0_0_0_1px_var(--brand-secondary),0_0_36px_-8px_var(--brand-secondary)]"
          : "border-white/10",
        className,
      )}
      style={{
        background: `radial-gradient(120% 120% at 30% 15%, hsl(${hue} 62% 26%), hsl(${hue} 55% 11%))`,
      }}
    >
      <motion.span
        layout
        className={cn(
          "grid place-items-center rounded-full bg-white/10 font-semibold text-white/90 backdrop-blur",
          compact ? "h-7 w-7 text-[10px]" : "h-11 w-11 text-sm",
        )}
      >
        {initials(person.name)}
      </motion.span>
      <motion.span
        layout
        className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white/85 backdrop-blur"
      >
        {person.muted ? (
          <IconMicOff className="h-2.5 w-2.5 text-rose-300" />
        ) : (
          <IconMic className="h-2.5 w-2.5 text-emerald-300" />
        )}
        {compact ? null : person.name.split(" ")[0]}
      </motion.span>
    </motion.div>
  );
}
