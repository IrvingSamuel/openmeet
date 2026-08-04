"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { BOARD_THEMES, brandToCssVars, type BrandTokens } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { morphTransition, springSoft } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { ColorField, Input, Textarea } from "@/components/ui/Field";
import { Badge, Divider, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { RoomPreview } from "@/components/landing/RoomPreview";
import { IconPalette, IconSparkles } from "@/components/ui/icons";

type Brand = BrandTokens & { customCss?: string | null };

const TAB_KEYS = ["identity", "palette", "advanced"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export function BrandPanel({ slug }: { slug: string }) {
  const toast = useToast();
  const t = useTranslations("brand.panel");
  const tTabs = useTranslations("brand.tabs");
  const tFields = useTranslations("brand.fields");
  const tThemes = useTranslations("brand.themes");
  const tLabels = useTranslations("common.labels");
  const tPlaceholders = useTranslations("common.placeholders");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<TabKey>("identity");

  useEffect(() => {
    fetch(`/api/rooms/${slug}/brand`)
      .then((r) => r.json())
      .then((d) => setBrand(d.brand || {}))
      .catch(() => toast.error(t("loadFailed")));
  }, [slug, toast, t]);

  const previewVars = useMemo(
    () => (brand ? brandToCssVars(brand) : {}),
    [brand],
  );

  function patch(next: Partial<Brand>) {
    setBrand((prev) => ({ ...(prev ?? {}), ...next }));
  }

  function applyPreset(key: string) {
    const preset = BOARD_THEMES[key];
    patch({
      themePreset: key,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      tertiaryColor: preset.tertiary,
    });
  }

  function themeLabel(key: string) {
    if (key in BOARD_THEMES) {
      return tThemes(key as keyof typeof BOARD_THEMES);
    }
    return tLabels("custom");
  }

  async function persist(body: Record<string, unknown>, importFromBoard = false) {
    if (importFromBoard) setImporting(true);
    else setSaving(true);
    try {
      const res = await fetch(`/api/rooms/${slug}/brand`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("saveFailed"));
        return;
      }
      setBrand(data.brand);
      toast.success(importFromBoard ? t("imported") : t("saved"));
    } catch {
      toast.error(t("saveNetworkFailed"));
    } finally {
      setSaving(false);
      setImporting(false);
    }
  }

  if (!brand) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Skeleton className="h-[520px] rounded-3xl" />
        <Skeleton className="h-[520px] rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,430px)_1fr]">
      <div className="rounded-3xl glass p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <IconPalette className="text-brand-secondary" />
            {t("title")}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            loading={importing}
            icon={<IconSparkles className="h-4 w-4" />}
            onClick={() => persist({ importFromBoard: true }, true)}
          >
            {t("importFromBoard")}
          </Button>
        </div>

        <div className="mt-5 flex gap-1 rounded-xl border border-line bg-black/25 p-1">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                "relative flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                tab === key ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {tab === key ? (
                <motion.span
                  layoutId="brand-tab"
                  transition={springSoft}
                  className="absolute inset-0 rounded-lg bg-white/[0.09] ring-1 ring-white/15"
                />
              ) : null}
              <span className="relative">{tTabs(key)}</span>
            </button>
          ))}
        </div>

        <motion.div layout transition={morphTransition} className="mt-5 space-y-4">
          {tab === "identity" ? (
            <>
              <Input
                label={tFields("lobbyTitle")}
                value={brand.lobbyTitle || ""}
                onChange={(e) => patch({ lobbyTitle: e.target.value })}
                placeholder={tPlaceholders("weeklyProduct")}
              />
              <Input
                label={tFields("lobbySubtitle")}
                value={brand.lobbySubtitle || ""}
                onChange={(e) => patch({ lobbySubtitle: e.target.value })}
                placeholder={t("defaultSubtitle")}
              />
              <Input
                label={tFields("logoUrl")}
                value={brand.logoUrl || ""}
                onChange={(e) => patch({ logoUrl: e.target.value })}
                placeholder="https://…/logo.svg"
                hint={tFields("logoHint")}
              />
              <Input
                label={tFields("wordmark")}
                value={brand.wordmark || ""}
                onChange={(e) => patch({ wordmark: e.target.value })}
                placeholder={tFields("wordmarkPlaceholder")}
              />
            </>
          ) : null}

          {tab === "palette" ? (
            <>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  {tFields("boardPreset")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(BOARD_THEMES).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      aria-pressed={brand.themePreset === key}
                      className={cn(
                        "relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        brand.themePreset === key
                          ? "border-transparent text-ink"
                          : "border-line text-ink-muted hover:text-ink",
                      )}
                    >
                      {brand.themePreset === key ? (
                        <motion.span
                          layoutId="brand-preset"
                          transition={springSoft}
                          className="absolute inset-0 rounded-full bg-white/[0.1] ring-1 ring-white/20"
                        />
                      ) : null}
                      <span
                        className="relative h-3 w-3 rounded-full ring-1 ring-white/25"
                        style={{
                          background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                        }}
                      />
                      <span className="relative">{themeLabel(key)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Divider />

              <div className="grid gap-3 sm:grid-cols-2">
                <ColorField
                  label={tFields("primary")}
                  value={brand.primaryColor || "#6366f1"}
                  onChange={(v) => patch({ primaryColor: v })}
                />
                <ColorField
                  label={tFields("secondary")}
                  value={brand.secondaryColor || "#22d3ee"}
                  onChange={(v) => patch({ secondaryColor: v })}
                />
                <ColorField
                  label={tFields("tertiary")}
                  value={brand.tertiaryColor || "#a855f7"}
                  onChange={(v) => patch({ tertiaryColor: v })}
                />
                <ColorField
                  label={tFields("background")}
                  value={brand.background || "#0b1020"}
                  onChange={(v) => patch({ background: v })}
                />
              </div>
            </>
          ) : null}

          {tab === "advanced" ? (
            <>
              <Input
                label={tFields("fontFamily")}
                value={brand.fontFamily || ""}
                onChange={(e) => patch({ fontFamily: e.target.value })}
                placeholder="Inter, system-ui, sans-serif"
                hint={tFields("fontHint")}
              />
              <Input
                label={tFields("faviconUrl")}
                value={brand.faviconUrl || ""}
                onChange={(e) => patch({ faviconUrl: e.target.value })}
                placeholder="https://…/favicon.png"
              />
              <Textarea
                label={tFields("customCss")}
                value={brand.customCss || ""}
                onChange={(e) => patch({ customCss: e.target.value })}
                placeholder={tFields("customCssPlaceholder")}
                rows={7}
                hint={tFields("customCssHint")}
              />
            </>
          ) : null}
        </motion.div>

        <Button
          full
          size="lg"
          className="mt-6"
          loading={saving}
          onClick={() => persist({ ...brand })}
        >
          {t("save")}
        </Button>
      </div>

      <motion.div
        layout
        transition={morphTransition}
        style={previewVars as React.CSSProperties}
        className="space-y-4 rounded-3xl border border-line p-5 lg:sticky lg:top-6"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            {t("livePreview")}
          </p>
          <Badge tone="brand" pulse>
            {themeLabel(brand.themePreset || "indigo")}
          </Badge>
        </div>

        <div
          className="overflow-hidden rounded-3xl p-5"
          style={{ background: brand.background || "#0b1020" }}
        >
          <div className="mb-4 flex items-center gap-3">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt=""
                className="h-9 max-w-[150px] object-contain"
              />
            ) : null}
            <div>
              <p
                className="text-lg font-semibold tracking-tight"
                style={{
                  color: brand.primaryColor || "#6366f1",
                  fontFamily: brand.fontFamily || undefined,
                }}
              >
                {brand.lobbyTitle || brand.wordmark || t("yourRoom")}
              </p>
              <p
                className="text-xs"
                style={{
                  color: brand.secondaryColor || "#22d3ee",
                  fontFamily: brand.fontFamily || undefined,
                }}
              >
                {brand.lobbySubtitle || t("defaultSubtitle")}
              </p>
            </div>
          </div>
          <RoomPreview />
        </div>
      </motion.div>
    </div>
  );
}
