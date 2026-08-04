"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BrandPanel } from "@/components/BrandPanel";
import { Aurora, PageTransition } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { IconArrowRight } from "@/components/ui/icons";

export default function BrandPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const t = useTranslations("brand.page");

  return (
    <div className="relative min-h-screen">
      <Aurora intensity={0.45} />
      <PageTransition className="relative mx-auto max-w-7xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link href={`/r/${slug}`}>
              <Button
                size="sm"
                variant="outline"
                iconRight={<IconArrowRight className="h-4 w-4" />}
              >
                {t("goToRoom")}
              </Button>
            </Link>
          </div>
        </header>

        <div className="mb-10 mt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-secondary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight">
            {t("title")}{" "}
            <span className="font-mono text-2xl text-ink-faint">/{slug}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            {t("description")}
          </p>
        </div>

        <BrandPanel slug={slug} />
      </PageTransition>
    </div>
  );
}
