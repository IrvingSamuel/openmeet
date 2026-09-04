"use client";

import { cn } from "@/lib/utils";
import type { BgAnimation } from "@/lib/brand";
import { Aurora } from "@/components/motion/primitives";

type BrandBackdropProps = {
  className?: string;
  animation?: BgAnimation | null;
  patternUrl?: string | null;
  /** Recolor pattern via CSS mask using --brand-pattern-tint. */
  patternTintActive?: boolean;
  intensity?: number;
};

/**
 * Layered brand surface: base paint, tiled pattern (+ optional tint), motion.
 * Parent must be `position: relative`. Reads CSS vars from brandToCssVars.
 */
export function BrandBackdrop({
  className,
  animation = "none",
  patternUrl,
  patternTintActive = false,
  intensity = 0.7,
}: BrandBackdropProps) {
  const anim = animation || "none";
  const hasPattern = Boolean(patternUrl);

  return (
    <div
      className={cn("brand-backdrop", className)}
      data-anim={anim}
      aria-hidden
    >
      <div className="brand-backdrop__base" />
      {hasPattern && !patternTintActive ? (
        <div className="brand-backdrop__pattern" />
      ) : null}
      {hasPattern && patternTintActive ? (
        <div className="brand-backdrop__pattern-tint" />
      ) : null}
      {anim === "beam" ? <div className="brand-backdrop__beam" /> : null}
      {anim === "aurora" ? (
        <div className="absolute inset-0">
          <Aurora intensity={intensity} />
        </div>
      ) : null}
    </div>
  );
}
