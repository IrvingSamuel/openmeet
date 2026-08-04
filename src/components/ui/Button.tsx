"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { springSnappy } from "@/components/motion/primitives";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-brand-gradient shadow-glow hover:shadow-glow-lg border border-white/15",
  secondary:
    "glass-strong text-ink hover:bg-white/[0.14] border border-line-strong",
  outline:
    "border border-line-strong text-ink hover:border-brand-primary hover:text-white bg-transparent",
  ghost: "text-ink-muted hover:text-ink hover:bg-white/[0.07] border border-transparent",
  danger:
    "bg-rose-500/90 text-white hover:bg-rose-500 border border-rose-400/40 shadow-[0_10px_40px_-12px_rgba(244,63,94,0.7)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-lg gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-14 px-7 text-base rounded-2xl gap-2.5",
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
  children?: ReactNode;
} & Omit<HTMLMotionProps<"button">, "ref" | "children">;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading,
      icon,
      iconRight,
      full,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <motion.button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        whileHover={disabled || loading ? undefined : { y: -2 }}
        whileTap={disabled || loading ? undefined : { scale: 0.97, y: 0 }}
        transition={springSnappy}
        className={cn(
          "relative inline-flex select-none items-center justify-center overflow-hidden font-semibold tracking-tight",
          "transition-colors duration-300 disabled:pointer-events-none disabled:opacity-45",
          VARIANTS[variant],
          SIZES[size],
          full && "w-full",
          className,
        )}
        {...rest}
      >
        {/* sheen sweep on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-spring hover:translate-x-full"
        />
        {loading ? (
          <span
            aria-hidden
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          icon
        )}
        {children ? <span className="relative">{children}</span> : null}
        {iconRight}
      </motion.button>
    );
  },
);
