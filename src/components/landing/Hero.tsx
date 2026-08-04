"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import {
  Aurora,
  AnimatedNumber,
  Magnetic,
  TextScramble,
  Tilt,
  EASE_OUT_EXPO,
} from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Surface";
import { IconArrowRight, IconGithub, IconSparkles } from "@/components/ui/icons";
import { RoomPreview } from "@/components/landing/RoomPreview";
import { GITHUB_REPO_URL } from "@/lib/site";

export function Hero() {
  const t = useTranslations("landing.hero");
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);

  const titleLines = [t("titleLine1"), t("titleLine2"), t("titleLine3")];
  const stats = [
    {
      value: 30,
      suffix: t("statLatencySuffix"),
      label: t("statLatencyLabel"),
    },
    {
      value: 100,
      suffix: t("statOpenSuffix"),
      label: t("statOpenLabel"),
    },
    {
      value: 0,
      suffix: t("statPluginSuffix"),
      label: t("statPluginLabel"),
    },
  ];

  return (
    <section
      ref={ref}
      className="relative flex min-h-[100svh] items-center overflow-hidden pb-24 pt-32"
    >
      <Aurora intensity={1.15} />
      <div aria-hidden className="absolute inset-0 mesh-bg opacity-70" />

      <motion.div
        style={{ y, opacity, scale }}
        className="relative mx-auto grid w-full max-w-7xl gap-14 px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center"
      >
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          >
            <Badge tone="brand" pulse className="mb-6">
              <IconSparkles className="h-3.5 w-3.5" />
              <TextScramble text={t("badge")} />
            </Badge>
          </motion.div>

          <h1 className="text-balance text-[clamp(2.6rem,6.4vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
            {titleLines.map((line, i) => (
              <motion.span
                key={line}
                className="block"
                initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  duration: 0.9,
                  delay: 0.12 + i * 0.11,
                  ease: EASE_OUT_EXPO,
                }}
              >
                {i === 2 ? (
                  <span className="text-brand-gradient">{line}</span>
                ) : (
                  line
                )}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: EASE_OUT_EXPO }}
            className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-ink-muted"
          >
            {t("subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.62, ease: EASE_OUT_EXPO }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Magnetic strength={0.22}>
              <Link href="/dashboard">
                <Button size="lg" iconRight={<IconArrowRight />}>
                  {t("ctaCreate")}
                </Button>
              </Link>
            </Magnetic>
            <Link href="#recursos">
              <Button size="lg" variant="outline">
                {t("ctaHow")}
              </Button>
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("ctaOpenSourceAria")}
            >
              <Button size="lg" variant="secondary" icon={<IconGithub />}>
                {t("ctaOpenSource")}
              </Button>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.72, ease: EASE_OUT_EXPO }}
            className="mt-4 max-w-lg text-sm leading-relaxed text-ink-faint"
          >
            {t("ctaOpenSourceHint")}
          </motion.p>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-14 grid max-w-lg grid-cols-1 gap-6 border-t border-line pt-7 min-[380px]:grid-cols-3"
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-semibold tracking-tight text-ink">
                  <AnimatedNumber value={stat.value} suffix={stat.suffix} />
                </dt>
                <dd className="mt-1 text-xs leading-snug text-ink-faint">
                  {stat.label}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 60, rotateY: -14 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 1.1, delay: 0.35, ease: EASE_OUT_EXPO }}
          className="perspective"
        >
          <Tilt max={6}>
            <RoomPreview />
          </Tilt>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="absolute bottom-7 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-9 w-5 items-start justify-center rounded-full border border-line-strong p-1"
        >
          <span className="h-1.5 w-1 rounded-full bg-brand-secondary" />
        </motion.div>
      </motion.div>
    </section>
  );
}
