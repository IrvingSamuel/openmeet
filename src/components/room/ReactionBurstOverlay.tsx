"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactionBurst } from "@/lib/room-reactions";

export function ReactionBurstOverlay({ bursts }: { bursts: ReactionBurst[] }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15] overflow-hidden"
      aria-hidden
    >
      <AnimatePresence initial={false}>
        {bursts.map((burst) => (
          <div
            key={burst.id}
            className="absolute bottom-[18%] -translate-x-1/2"
            style={{ left: `${burst.startX}%` }}
          >
            <motion.div
              className="flex flex-col items-center gap-0.5"
              initial={{
                y: 0,
                x: 0,
                opacity: 0,
                scale: 0.85,
                rotate: 0,
              }}
              animate={{
                y: "-50vh",
                x: [
                  0,
                  burst.wobble * 0.35,
                  burst.driftX * 0.45,
                  burst.driftX * 0.75,
                  burst.driftX,
                ],
                opacity: [0, 1, 0.95, 0.4, 0],
                scale: [0.85, 0.95, 0.95, 0.9, 0.85],
                rotate: [
                  0,
                  burst.rotation * 0.35,
                  burst.rotation * 0.7,
                  burst.rotation,
                ],
              }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                duration: burst.duration,
                ease: [0.33, 0, 0.2, 1],
                times: [0, 0.08, 0.55, 0.82, 1],
              }}
            >
              <span
                className="select-none text-lg leading-none drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)] sm:text-xl"
                style={{
                  filter: "drop-shadow(0 0 6px rgba(255,255,255,0.12))",
                }}
              >
                {burst.emoji}
              </span>
              <span
                className="max-w-[7rem] truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/92 backdrop-blur-sm"
              >
                {burst.displayName}
              </span>
            </motion.div>
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
