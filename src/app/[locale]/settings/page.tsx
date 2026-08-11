"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BrandPanel } from "@/components/BrandPanel";
import { Aurora, PageTransition } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { IconArrowRight } from "@/components/ui/icons";

type Me = { isLoggedIn: boolean };

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ isLoggedIn: false }));
  }, []);

  if (me === null) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-[520px] w-full rounded-3xl" />
      </div>
    );
  }

  if (!me.isLoggedIn) {
    return (
      <div className="relative min-h-screen">
        <Aurora intensity={0.4} />
        <PageTransition className="relative mx-auto max-w-lg px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("signedOut.title")}</h1>
          <p className="mt-3 text-sm text-ink-muted">{t("signedOut.body")}</p>
          <div className="mt-8 flex justify-center gap-3">
            <a href="/login">
              <Button>{t("signedOut.login")}</Button>
            </a>
            <Link href="/">
              <Button variant="ghost">{tCommon("actions.goToDashboardAlt")}</Button>
            </Link>
          </div>
        </PageTransition>
      </div>
    );
  }

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
            <Link href="/dashboard">
              <Button
                size="sm"
                variant="outline"
                iconRight={<IconArrowRight className="h-4 w-4" />}
              >
                {tCommon("actions.dashboard")}
              </Button>
            </Link>
          </div>
        </header>

        <div className="mt-12 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-secondary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("description")}</p>
        </div>

        <div className="mt-10">
          <BrandPanel showImportFromBoard={false} />
        </div>
      </PageTransition>
    </div>
  );
}
