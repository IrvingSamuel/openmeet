"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Chronos Meet mark — product logo (C + clock + camera nodes).
 */
export function LogoMark({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <motion.span
      className={cn(
        "relative inline-flex overflow-hidden rounded-lg",
        className,
      )}
      animate={animated ? { scale: [1, 1.04, 1] } : undefined}
      transition={
        animated
          ? { duration: 4.5, ease: "easeInOut", repeat: Infinity }
          : undefined
      }
    >
      <Image
        src="/Chronos_Meet_Logo.png"
        alt=""
        width={80}
        height={80}
        className="h-full w-full object-cover"
        priority
        aria-hidden
      />
    </motion.span>
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
