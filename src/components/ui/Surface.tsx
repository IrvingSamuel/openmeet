"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spotlight } from "@/components/motion/primitives";

export function Card({
  children,
  className,
  spotlight = false,
  glow = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  spotlight?: boolean;
  glow?: boolean;
} & Omit<HTMLMotionProps<"div">, "ref" | "children">) {
  const card = (
    <motion.div
      className={cn(
        "relative overflow-hidden rounded-3xl glass p-6",
        glow && "border-gradient",
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
  return spotlight ? (
    <Spotlight className="rounded-3xl">{card}</Spotlight>
  ) : (
    card
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
  pulse = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warn" | "danger";
  className?: string;
  pulse?: boolean;
}) {
  const tones = {
    neutral: "border-line-strong text-ink-muted bg-white/[0.04]",
    brand:
      "border-brand-primary/40 text-white bg-[color-mix(in_srgb,var(--brand-primary)_22%,transparent)]",
    success: "border-emerald-400/40 text-emerald-200 bg-emerald-400/10",
    warn: "border-amber-400/40 text-amber-200 bg-amber-400/10",
    danger: "border-rose-400/40 text-rose-200 bg-rose-400/10",
  } as const;
  const dots = {
    neutral: "bg-ink-faint",
    brand: "bg-brand-secondary",
    success: "bg-emerald-400",
    warn: "bg-amber-400",
    danger: "bg-rose-400",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight backdrop-blur",
        tones[tone],
        className,
      )}
    >
      {pulse ? (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse-ring",
              dots[tone],
            )}
          />
          <span
            className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dots[tone])}
          />
        </span>
      ) : null}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "shimmer-track rounded-xl bg-white/[0.05]",
        className,
      )}
      aria-hidden
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "space-y-3",
        align === "center" && "text-center mx-auto max-w-2xl",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-secondary">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-pretty text-base leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "h-px w-full bg-gradient-to-r from-transparent via-line-strong to-transparent",
        className,
      )}
    />
  );
}
