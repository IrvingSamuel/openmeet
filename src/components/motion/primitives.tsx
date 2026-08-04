"use client";

import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionProps,
  type Transition,
  type Variants,
} from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

const NUMBER_LOCALES: Record<string, string> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

function resolveNumberLocale(locale?: string): string {
  if (!locale) return "en-US";
  return NUMBER_LOCALES[locale] ?? locale;
}

/* ------------------------------------------------------------------ *
 * Shared easing + transition vocabulary
 * ------------------------------------------------------------------ */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const springSoft: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 30,
  mass: 0.9,
};

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

/** Shared transition for `layoutId` morphs across the whole app. */
export const morphTransition: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  mass: 0.8,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_OUT_EXPO },
  },
};

export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/* ------------------------------------------------------------------ *
 * Reveal — scroll-triggered entrance
 * ------------------------------------------------------------------ */

export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  once = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
} & MotionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-12% 0px -8% 0px" });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0, y, filter: "blur(8px)" }}
      animate={
        inView || reduced
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y, filter: "blur(8px)" }
      }
      transition={{ duration: 0.75, ease: EASE_OUT_EXPO, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its `<Reveal>`/`motion` children on view. */
export function StaggerGroup({
  children,
  className,
  stagger = 0.07,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & MotionProps) {
  return (
    <motion.div className={className} variants={fadeUp} {...rest}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Magnetic — cursor-attracted element
 * ------------------------------------------------------------------ */

export function Magnetic({
  children,
  className,
  strength = 0.35,
  radius = 120,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useSpring(useMotionValue(0), springSnappy);
  const y = useSpring(useMotionValue(0), springSnappy);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    function onMove(e: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + Math.max(rect.width, rect.height) / 2) {
        x.set(0);
        y.set(0);
        return;
      }
      x.set(dx * strength);
      y.set(dy * strength);
    }
    function onLeave() {
      x.set(0);
      y.set(0);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [radius, strength, x, y, reduced]);

  return (
    <motion.div ref={ref} className={className} style={{ x, y }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Spotlight — radial glow that tracks the pointer inside a surface
 * ------------------------------------------------------------------ */

export function Spotlight({
  children,
  className,
  size = 420,
  opacity = 0.14,
}: {
  children: ReactNode;
  className?: string;
  size?: number;
  opacity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const background = useTransform(
    [mx, my],
    ([px, py]) =>
      `radial-gradient(${size}px circle at ${px}px ${py}px, color-mix(in srgb, var(--brand-primary) ${
        opacity * 100
      }%, transparent), transparent 70%)`,
  );

  return (
    <div
      ref={ref}
      className={cn("group relative", className)}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - rect.left);
        my.set(e.clientY - rect.top);
      }}
      onPointerLeave={() => {
        mx.set(-1000);
        my.set(-1000);
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tilt — 3D perspective card
 * ------------------------------------------------------------------ */

export function Tilt({
  children,
  className,
  max = 8,
  scale = 1.015,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  scale?: number;
}) {
  const reduced = useReducedMotion();
  const rx = useSpring(useMotionValue(0), springSoft);
  const ry = useSpring(useMotionValue(0), springSoft);
  const s = useSpring(useMotionValue(1), springSoft);

  return (
    <motion.div
      className={cn("preserve-3d", className)}
      style={{ rotateX: rx, rotateY: ry, scale: s, transformPerspective: 1000 }}
      onPointerMove={(e) => {
        if (reduced) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        ry.set(px * max * 2);
        rx.set(-py * max * 2);
        s.set(scale);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
        s.set(1);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * AnimatedNumber — spring counter
 * ------------------------------------------------------------------ */

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  className,
  locale: localeProp,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  /** BCP-47 or app locale (en/pt/…). Overrides next-intl when set. */
  locale?: string;
}) {
  const intlLocale = useLocale();
  const numberLocale = resolveNumberLocale(localeProp ?? intlLocale);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const [display, setDisplay] = useState(0);
  const spring = useSpring(0, { stiffness: 70, damping: 22 });

  useEffect(() => {
    if (inView) spring.set(value);
  }, [inView, spring, value]);

  useEffect(() => spring.on("change", (v) => setDisplay(v)), [spring]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString(numberLocale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * TextScramble — decoding text effect for hero eyebrow / status
 * ------------------------------------------------------------------ */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>[]{}#$%&*";

export function TextScramble({
  text,
  className,
  speed = 1.6,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const reduced = useReducedMotion();
  const [output, setOutput] = useState(reduced ? text : "");
  const progress = useRef(0);

  useAnimationFrame((_, delta) => {
    if (reduced) return;
    if (progress.current >= text.length) return;
    progress.current += (delta / 1000) * speed * 12;
    const settled = Math.floor(progress.current);
    const scrambled = text
      .split("")
      .map((char, i) => {
        if (i < settled) return char;
        if (char === " ") return " ";
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      })
      .join("");
    setOutput(scrambled);
  });

  return (
    <span className={className} aria-label={text}>
      {output || "\u00a0"}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Page transition shell
 * ------------------------------------------------------------------ */

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Morph context — shared layoutId namespace so tiles can morph between
 * grid and spotlight arrangements without id collisions across views.
 * ------------------------------------------------------------------ */

const MorphNamespace = createContext("global");

export function MorphScope({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <MorphNamespace.Provider value={id}>{children}</MorphNamespace.Provider>
  );
}

export function useMorphId(key: string) {
  const ns = useContext(MorphNamespace);
  return `${ns}:${key}`;
}

/* ------------------------------------------------------------------ *
 * Aurora — animated ambient background
 * ------------------------------------------------------------------ */

export function Aurora({
  className,
  intensity = 1,
  interactive = true,
}: {
  className?: string;
  intensity?: number;
  interactive?: boolean;
}) {
  const reduced = useReducedMotion();
  const mx = useSpring(useMotionValue(0.5), { stiffness: 40, damping: 20 });
  const my = useSpring(useMotionValue(0.35), { stiffness: 40, damping: 20 });

  useEffect(() => {
    if (!interactive || reduced) return;
    function onMove(e: PointerEvent) {
      mx.set(e.clientX / window.innerWidth);
      my.set(e.clientY / window.innerHeight);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [interactive, mx, my, reduced]);

  const left = useTransform(mx, (v) => `${18 + v * 16}%`);
  const top = useTransform(my, (v) => `${4 + v * 14}%`);
  const right = useTransform(mx, (v) => `${8 + (1 - v) * 16}%`);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden grain",
        className,
      )}
    >
      <motion.div
        className="absolute h-[46vw] w-[46vw] rounded-full blur-[110px] animate-aurora-drift"
        style={{
          left,
          top,
          opacity: 0.5 * intensity,
          background:
            "radial-gradient(circle, var(--brand-primary), transparent 62%)",
        }}
      />
      <motion.div
        className="absolute h-[38vw] w-[38vw] rounded-full blur-[120px] animate-aurora-drift [animation-delay:-7s]"
        style={{
          right,
          top: "12%",
          opacity: 0.4 * intensity,
          background:
            "radial-gradient(circle, var(--brand-secondary), transparent 62%)",
        }}
      />
      <div
        className="absolute -bottom-[18vw] left-1/3 h-[40vw] w-[40vw] rounded-full blur-[130px] animate-aurora-drift [animation-delay:-14s]"
        style={{
          opacity: 0.32 * intensity,
          background:
            "radial-gradient(circle, var(--brand-tertiary), transparent 62%)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Re-exports so feature code imports one module
 * ------------------------------------------------------------------ */

export { AnimatePresence, motion, useReducedMotion };
export type { CSSProperties };
