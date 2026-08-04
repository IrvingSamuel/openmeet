"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "motion/react";
import {
  Aurora,
  Magnetic,
  Reveal,
  StaggerGroup,
  StaggerItem,
  springSoft,
} from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Badge, SectionHeading } from "@/components/ui/Surface";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { IconArrowRight } from "@/components/ui/icons";

export function Infra() {
  const t = useTranslations("landing.infra");

  const stack = [
    {
      name: t("nameMedia"),
      role: t("roleMedia"),
      detail: t("detailMedia"),
    },
    {
      name: t("nameApp"),
      role: t("roleApp"),
      detail: t("detailApp"),
    },
    {
      name: t("nameState"),
      role: t("roleState"),
      detail: t("detailState"),
    },
    {
      name: t("nameCopilot"),
      role: t("roleCopilot"),
      detail: t("detailCopilot"),
    },
    {
      name: t("nameIdentity"),
      role: t("roleIdentity"),
      detail: t("detailIdentity"),
    },
    {
      name: t("nameIntegration"),
      role: t("roleIntegration"),
      detail: t("detailIntegration"),
    },
  ];

  return (
    <section id="infra" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={t("title")}
            description={t("description")}
            align="center"
          />
        </Reveal>

        <StaggerGroup className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stack.map((item) => (
            <StaggerItem key={item.name}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={springSoft}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/[0.03] px-5 py-4 transition-colors hover:border-brand-primary/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{item.name}</p>
                  <p className="text-xs text-ink-faint">{item.detail}</p>
                </div>
                <Badge>{item.role}</Badge>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function FinalCta() {
  const t = useTranslations("landing.cta");

  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] border border-line-strong px-8 py-20 text-center">
            <Aurora intensity={1.4} interactive={false} />
            <div className="relative">
              <h2 className="text-balance text-[clamp(2rem,4.4vw,3.2rem)] font-semibold leading-tight tracking-tight">
                {t("titleBefore")}{" "}
                <span className="text-brand-gradient">{t("titleGradient")}</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-ink-muted">
                {t("body")}
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Magnetic strength={0.25}>
                  <Link href="/dashboard">
                    <Button size="lg" iconRight={<IconArrowRight />}>
                      {t("openDashboard")}
                    </Button>
                  </Link>
                </Magnetic>
                <a href="/api/auth/login">
                  <Button size="lg" variant="secondary">
                    {t("loginChronos")}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const t = useTranslations("landing.footer");

  return (
    <footer className="border-t border-line py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-7 w-7" animated={false} />
          <Wordmark />
        </div>
        <p className="text-xs text-ink-faint">{t("tagline")}</p>
        <nav className="flex gap-5 text-xs text-ink-muted">
          <Link href="/dashboard" className="transition-colors hover:text-ink">
            {t("panel")}
          </Link>
          <a href="/api/health" className="transition-colors hover:text-ink">
            {t("status")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
