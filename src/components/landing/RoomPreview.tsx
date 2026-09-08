"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn, hueFromString, initials } from "@/lib/utils";
import { springSoft } from "@/components/motion/primitives";
import {
  IconCaptions,
  IconMic,
  IconMicOff,
  IconPhoneOff,
  IconScreen,
  IconVideo,
} from "@/components/ui/icons";

const TICK_MS = 3400;
const MODE_TICKS = 2;

type Person = { id: string; name: string; muted: boolean };
type LayoutMode = "grid" | "spotlight";

function resolveSpeaker(people: Person[], speakerLabel: string): Person {
  return (
    people.find((p) => p.name.startsWith(speakerLabel)) ??
    people.find((p) => p.id === "ana")!
  );
}

/**
 * Self-playing miniature of the meeting UI for marketing sections.
 */
export function RoomPreview({ className }: { className?: string }) {
  const t = useTranslations("landing.roomPreview");
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);

  const people: Person[] = [
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
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const captionIndex = tick % script.length;
  const line = script[captionIndex]!;
  const active = resolveSpeaker(people, line.speaker);
  const mode: LayoutMode =
    Math.floor(tick / MODE_TICKS) % 2 === 0 ? "spotlight" : "grid";

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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0"
          >
            {mode === "grid" ? (
              <div className="grid h-full grid-cols-3 grid-rows-2 gap-2 p-2">
                {people.map((person) => (
                  <Tile
                    key={person.id}
                    person={person}
                    speaking={person.id === active.id}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full gap-2 p-2">
                <div className="relative min-h-0 min-w-0 flex-[1]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={active.id}
                      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.28 }}
                      className="h-full w-full"
                    >
                      <Tile
                        person={active}
                        speaking
                        className="h-full w-full"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="flex w-[26%] min-w-0 flex-col gap-2">
                  {people
                    .filter((p) => p.id !== active.id)
                    .map((person) => (
                      <Tile
                        key={person.id}
                        person={person}
                        compact
                        className="min-h-[2.5rem] flex-1"
                      />
                    ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={captionIndex}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none absolute bottom-3 left-1/2 z-10 max-w-[86%] -translate-x-1/2 rounded-xl bg-black/70 px-3 py-2 text-center text-[11px] leading-snug text-white/90 backdrop-blur-md"
          >
            <span className="font-semibold text-brand-secondary">
              {line.speaker}:{" "}
            </span>
            {line.text}
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
  person: Person;
  speaking?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const hue = hueFromString(person.id);
  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border",
        speaking
          ? "border-brand-secondary/70 shadow-[0_0_0_1px_var(--brand-secondary),0_0_36px_-8px_var(--brand-secondary)]"
          : "border-white/10",
        className,
      )}
      style={{
        background: `radial-gradient(120% 120% at 30% 15%, hsl(${hue} 62% 26%), hsl(${hue} 55% 11%))`,
      }}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full bg-white/10 font-semibold text-white/90 backdrop-blur",
          compact ? "h-7 w-7 text-[10px]" : "h-11 w-11 text-sm",
        )}
      >
        {initials(person.name)}
      </span>
      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white/85 backdrop-blur">
        {person.muted ? (
          <IconMicOff className="h-2.5 w-2.5 text-rose-300" />
        ) : (
          <IconMic className="h-2.5 w-2.5 text-emerald-300" />
        )}
        {compact ? null : person.name.split(" ")[0]}
      </span>
    </div>
  );
}
