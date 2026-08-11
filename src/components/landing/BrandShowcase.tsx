"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { BOARD_THEMES, brandToCssVars } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Reveal, morphTransition, springSoft } from "@/components/motion/primitives";
import { SectionHeading } from "@/components/ui/Surface";
import { RoomPreview } from "@/components/landing/RoomPreview";

const PRESETS = Object.entries(BOARD_THEMES);

/**
 * Live proof of the branding engine: switching a preset rewrites the same CSS
 * variables the real room uses, so the preview repaints exactly like production.
 */
export function BrandShowcase() {
  const t = useTranslations("landing.brandShowcase");
  const [preset, setPreset] = useState("sky");
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setPreset((current) => {
        const index = PRESETS.findIndex(([key]) => key === current);
        return PRESETS[(index + 1) % PRESETS.length][0];
      });
    }, 4200);
    return () => clearInterval(id);
  }, [autoplay]);

  const vars = brandToCssVars({ themePreset: preset });

  return (
    <section id="marca" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <Reveal>
            <SectionHeading
              eyebrow={t("eyebrow")}
              title={
                <>
                  {t("titleBefore")}{" "}
                  <span className="text-brand-gradient">{t("titleGradient")}</span>
                </>
              }
              description={t("description")}
            />

            <div
              className="mt-8 flex flex-wrap gap-2"
              onMouseEnter={() => setAutoplay(false)}
              onMouseLeave={() => setAutoplay(true)}
            >
              {PRESETS.map(([key, theme]) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  aria-pressed={preset === key}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                    preset === key
                      ? "border-transparent text-ink"
                      : "border-line text-ink-muted hover:text-ink",
                  )}
                >
                  {preset === key ? (
                    <motion.span
                      layoutId="preset-pill"
                      transition={springSoft}
                      className="absolute inset-0 rounded-full bg-white/[0.1] ring-1 ring-white/20"
                    />
                  ) : null}
                  <span
                    className="relative h-3.5 w-3.5 rounded-full ring-1 ring-white/25"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                    }}
                  />
                  <span className="relative">{theme.label}</span>
                </button>
              ))}
            </div>

            <motion.pre
              layout
              transition={morphTransition}
              className="mt-8 overflow-x-auto rounded-2xl border border-line bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-ink-muted"
            >
              {Object.entries(vars)
                .filter(([k]) => k.startsWith("--brand-") && k !== "--brand-logo-url")
                .map(([k, v]) => (
                  <div key={k}>
                    <span className="text-brand-secondary">{k}</span>
                    <span className="text-ink-faint">: </span>
                    <motion.span key={v} layout className="text-ink">
                      {v}
                    </motion.span>
                    <span className="text-ink-faint">;</span>
                  </div>
                ))}
            </motion.pre>
          </Reveal>

          <Reveal delay={0.1}>
            <motion.div style={vars as React.CSSProperties} className="perspective">
              <RoomPreview />
            </motion.div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
