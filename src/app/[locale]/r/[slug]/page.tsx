"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { brandStyleString, type BrandTokens } from "@/lib/brand";
import { Aurora, PageTransition } from "@/components/motion/primitives";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { IconArrowRight, IconBolt, IconPalette } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";

type RoomPayload = {
  room: {
    id: string;
    slug: string;
    title: string;
    accessPolicy: string;
  };
  brand: (BrandTokens & { customCss?: string | null }) | null;
};

export default function RoomTemplatePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("roomTemplate");
  const tCommon = useTranslations("common");
  const [data, setData] = useState<RoomPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);
  const [me, setMe] = useState<{ isLoggedIn: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) setMe(payload);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!data?.brand) return;
    document.documentElement.style.cssText = brandStyleString(data.brand);
    return () => {
      document.documentElement.style.cssText = "";
    };
  }, [data]);

  // Legacy: if an active meeting still references this brand template, offer join.
  useEffect(() => {
    if (!data?.room?.id) return;
    let cancelled = false;
    fetch(`/api/meetings?limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.meetings) return;
        const active = payload.meetings.find(
          (m: { status: string; room?: { id?: string | null; slug?: string } }) =>
            m.status === "active" && m.room?.slug,
        );
        // no auto-redirect — user starts explicitly
        void active;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data]);

  const startMeeting = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${slug}/start`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t("startFailed"));
        return;
      }
      router.push(`/m/${json.slug}`);
    } catch {
      toast.error(t("startNetworkFailed"));
    } finally {
      setStarting(false);
    }
  }, [router, slug, t, toast]);

  if (notFound) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <Aurora intensity={0.4} />
        <div className="relative space-y-4">
          <LogoMark className="mx-auto h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("notFound")}</h1>
          <Link href="/dashboard">
            <Button>{tCommon("actions.dashboard")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-8 h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const brand = data.brand;

  return (
    <div className="relative min-h-screen">
      <Aurora intensity={0.45} />
      {brand?.customCss ? <style>{brand.customCss}</style> : null}
      <PageTransition className="relative mx-auto max-w-3xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <Wordmark />
          </Link>
          <LanguageSwitcher compact />
        </header>

        <div className="relative mt-12 overflow-hidden rounded-3xl border border-line p-8">
          <BrandBackdrop
            animation={brand?.bgAnimation || "none"}
            patternUrl={brand?.patternUrl}
            patternTintActive={Boolean(
              brand?.patternTint && brand.patternTint !== "none",
            )}
            intensity={0.5}
          />
          <div className="relative z-[1] space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-secondary">
              {t("eyebrow")}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {brand?.lobbyTitle || data.room.title}
            </h1>
            <p className="max-w-lg text-sm text-ink-muted">
              {brand?.lobbySubtitle || t("description")}
            </p>
            <div className="flex flex-wrap gap-3 pt-4">
              {me?.isLoggedIn ? (
                <Button
                  size="lg"
                  loading={starting}
                  icon={<IconBolt />}
                  onClick={() => void startMeeting()}
                >
                  {t("startMeeting")}
                </Button>
              ) : (
                <a href="/api/auth/login">
                  <Button size="lg">{t("loginToStart")}</Button>
                </a>
              )}
              <Link href={`/r/${slug}/brand`}>
                <Button
                  size="lg"
                  variant="outline"
                  icon={<IconPalette className="h-4 w-4" />}
                  iconRight={<IconArrowRight className="h-4 w-4" />}
                >
                  {t("editBrand")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </PageTransition>
    </div>
  );
}
