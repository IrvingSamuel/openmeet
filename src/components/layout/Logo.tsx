"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Chronos Meet mark: an orbit ring (chronos) around a lens (meet).
 * The ring counter-rotates on hover via the parent `group`.
 */
export function LogoMark({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="cm-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" />
            <stop offset="55%" stopColor="var(--brand-secondary)" />
            <stop offset="100%" stopColor="var(--brand-tertiary)" />
          </linearGradient>
        </defs>
        <motion.g
          animate={animated ? { rotate: 360 } : undefined}
          transition={{ duration: 24, ease: "linear", repeat: Infinity }}
          style={{ originX: "20px", originY: "20px" }}
        >
          <ellipse
            cx="20"
            cy="20"
            rx="17"
            ry="7.5"
            fill="none"
            stroke="url(#cm-grad)"
            strokeWidth="1.6"
            opacity="0.75"
            transform="rotate(-28 20 20)"
          />
          <circle cx="35" cy="12.5" r="2.2" fill="var(--brand-secondary)" />
        </motion.g>
        <rect
          x="9"
          y="12.5"
          width="16"
          height="15"
          rx="4.5"
          fill="url(#cm-grad)"
        />
        <path
          d="M26.5 17.5 32 14.2v11.6l-5.5-3.3v-5Z"
          fill="url(#cm-grad)"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}

export function Wordmark({
  className,
  label = "Chronos",
  accent = "Meet",
}: {
  className?: string;
  label?: string;
  accent?: string;
}) {
  return (
    <span
      className={cn(
        "text-[15px] font-semibold tracking-tight text-ink",
        className,
      )}
    >
      {label} <span className="text-brand-gradient">{accent}</span>
    </span>
  );
}
