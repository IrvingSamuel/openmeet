"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Reveal,
  Spotlight,
  StaggerGroup,
  StaggerItem,
  springSoft,
} from "@/components/motion/primitives";
import { SectionHeading } from "@/components/ui/Surface";
import {
  IconBolt,
  IconCalendar,
  IconCaptions,
  IconPalette,
  IconShield,
  IconSparkles,
} from "@/components/ui/icons";

export function Features() {
  const t = useTranslations("landing.features");

  const features: Array<{
    icon: ReactNode;
    title: string;
    body: string;
    span?: string;
  }> = [
    {
      icon: <IconPalette />,
      title: t("item1Title"),
      body: t("item1Body"),
      span: "md:col-span-2",
    },
    {
      icon: <IconCaptions />,
      title: t("item2Title"),
      body: t("item2Body"),
    },
    {
      icon: <IconSparkles />,
      title: t("item3Title"),
      body: t("item3Body"),
    },
    {
      icon: <IconShield />,
      title: t("item4Title"),
      body: t("item4Body"),
      span: "md:col-span-2",
    },
    {
      icon: <IconBolt />,
      title: t("item5Title"),
      body: t("item5Body"),
    },
    {
      icon: <IconCalendar />,
      title: t("item6Title"),
      body: t("item6Body"),
    },
  ];

  return (
    <section id="recursos" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
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
            align="center"
          />
        </Reveal>

        <StaggerGroup className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <StaggerItem key={feature.title} className={cn(feature.span)}>
              <Spotlight className="h-full rounded-3xl">
                <motion.article
                  whileHover={{ y: -6 }}
                  transition={springSoft}
                  className="group relative h-full overflow-hidden rounded-3xl glass p-7"
                >
                  <div
                    aria-hidden
                    className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-primary/20 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                  <motion.div
                    whileHover={{ rotate: -8, scale: 1.08 }}
                    transition={springSoft}
                    className="mb-5 grid h-11 w-11 place-items-center rounded-2xl border border-line-strong bg-white/[0.06] text-brand-secondary"
                  >
                    {feature.icon}
                  </motion.div>
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted">
                    {feature.body}
                  </p>
                </motion.article>
              </Spotlight>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
