"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  BOARD_THEMES,
  brandToCssVars,
  resolvePaint,
  solidPaint,
  type BgAnimation,
  type BrandTokens,
  type PaintToken,
  type PatternSizeMode,
  type PatternTint,
} from "@/lib/brand";
import { cn } from "@/lib/utils";
import { morphTransition, springSoft } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { ColorField, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Divider, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { RoomPreview } from "@/components/landing/RoomPreview";
import { IconPalette, IconSparkles } from "@/components/ui/icons";
import { PaintField } from "@/components/brand/PaintField";
import { AssetUrlField } from "@/components/brand/AssetUrlField";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";

type Brand = BrandTokens & { customCss?: string | null };

const TAB_KEYS = ["identity", "palette", "advanced"] as const;
type TabKey = (typeof TAB_KEYS)[number];

function paintOf(
  brand: Brand,
  key: "primary" | "secondary" | "tertiary" | "background",
): PaintToken {
  const solids = {
    primary: brand.primaryColor || "#8b5cf6",
    secondary: brand.secondaryColor || "#a78bfa",
    tertiary: brand.tertiaryColor || "#d946ef",
    background: brand.background || "#0b1020",
  };
  const paints = {
    primary: brand.primaryPaint,
    secondary: brand.secondaryPaint,
    tertiary: brand.tertiaryPaint,
    background: brand.backgroundPaint,
  };
  return resolvePaint(paints[key], solids[key]);
}

type BrandPanelProps = {
  /** Room brand editor — when set, defaults APIs to `/api/rooms/{slug}/brand`. */
  slug?: string;
  brandUrl?: string;
  uploadUrl?: string;
  showImportFromBoard?: boolean;
};

export function BrandPanel({
  slug,
  brandUrl,
  uploadUrl,
  showImportFromBoard,
}: BrandPanelProps) {
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

  const resolvedBrandUrl =
    brandUrl || (slug ? `/api/rooms/${slug}/brand` : "/api/me/brand");
  const resolvedUploadUrl =
    uploadUrl ||
    (slug ? `/api/rooms/${slug}/brand/upload` : "/api/me/brand/upload");
  const canImport = showImportFromBoard ?? Boolean(slug);

  useEffect(() => {
    fetch(resolvedBrandUrl)
      .then((r) => r.json())
      .then((d) => setBrand(d.brand || {}))
      .catch(() => toast.error(t("loadFailed")));
  }, [resolvedBrandUrl, toast, t]);

  const previewVars = useMemo(
    () => (brand ? brandToCssVars(brand) : {}),
    [brand],
  );

  function patch(next: Partial<Brand>) {
    setBrand((prev) => ({ ...(prev ?? {}), ...next }));
  }

  function setPaint(
    key: "primary" | "secondary" | "tertiary" | "background",
    paint: PaintToken,
  ) {
    const colorKey = {
      primary: "primaryColor",
      secondary: "secondaryColor",
      tertiary: "tertiaryColor",
      background: "background",
    } as const;
    const paintKey = {
      primary: "primaryPaint",
      secondary: "secondaryPaint",
      tertiary: "tertiaryPaint",
      background: "backgroundPaint",
    } as const;
    patch({
      [paintKey[key]]: paint,
      [colorKey[key]]: paint.solid,
    });
  }

  function applyPreset(key: string) {
    const preset = BOARD_THEMES[key];
    patch({
      themePreset: key,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      tertiaryColor: preset.tertiary,
      primaryPaint: solidPaint(preset.primary),
      secondaryPaint: solidPaint(preset.secondary),
      tertiaryPaint: solidPaint(preset.tertiary),
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
      const res = await fetch(resolvedBrandUrl, {
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

  const primaryPaint = paintOf(brand, "primary");
  const secondaryPaint = paintOf(brand, "secondary");
  const tertiaryPaint = paintOf(brand, "tertiary");
  const backgroundPaint = paintOf(brand, "background");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,430px)_1fr]">
      <div className="rounded-3xl glass p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <IconPalette className="text-brand-secondary" />
            {t("title")}
          </h2>
          {canImport ? (
            <Button
              size="sm"
              variant="ghost"
              loading={importing}
              icon={<IconSparkles className="h-4 w-4" />}
              onClick={() => persist({ importFromBoard: true }, true)}
            >
              {t("importFromBoard")}
            </Button>
          ) : null}
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
              <AssetUrlField
                label={tFields("logoUrl")}
                hint={tFields("logoHint")}
                value={brand.logoUrl || ""}
                onChange={(logoUrl) => patch({ logoUrl: logoUrl || null })}
                uploadUrl={resolvedUploadUrl}
                kind="logo"
                placeholder="https://…/logo.svg"
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

              <div className="grid gap-3">
                <PaintField
                  label={tFields("primary")}
                  value={primaryPaint}
                  onChange={(p) => setPaint("primary", p)}
                  gradientCompanion={secondaryPaint.solid}
                />
                <PaintField
                  label={tFields("secondary")}
                  value={secondaryPaint}
                  onChange={(p) => setPaint("secondary", p)}
                  gradientCompanion={tertiaryPaint.solid}
                />
                <PaintField
                  label={tFields("tertiary")}
                  value={tertiaryPaint}
                  onChange={(p) => setPaint("tertiary", p)}
                  gradientCompanion={primaryPaint.solid}
                />
                <PaintField
                  label={tFields("background")}
                  value={backgroundPaint}
                  onChange={(p) => setPaint("background", p)}
                  gradientCompanion={primaryPaint.solid}
                />
              </div>

              <Divider />

              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {tFields("surface")}
              </p>

              <AssetUrlField
                label={tFields("patternUrl")}
                hint={tFields("patternHint")}
                value={brand.patternUrl || ""}
                onChange={(patternUrl) => patch({ patternUrl: patternUrl || null })}
                uploadUrl={resolvedUploadUrl}
                kind="pattern"
                placeholder="https://…/pattern.png"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={tFields("patternSizeMode")}
                  value={brand.patternSizeMode || "percent"}
                  onChange={(e) =>
                    patch({
                      patternSizeMode: e.target.value as PatternSizeMode,
                      patternSize:
                        e.target.value === "fixed"
                          ? brand.patternSize && brand.patternSize > 16
                            ? brand.patternSize
                            : 128
                          : brand.patternSize && brand.patternSize <= 100
                            ? brand.patternSize
                            : 24,
                    })
                  }
                >
                  <option value="percent">{tFields("patternSizePercent")}</option>
                  <option value="fixed">{tFields("patternSizeFixed")}</option>
                </Select>
                <Input
                  label={tFields("patternSize")}
                  type="number"
                  min={brand.patternSizeMode === "fixed" ? 16 : 1}
                  max={brand.patternSizeMode === "fixed" ? 512 : 100}
                  value={brand.patternSize ?? (brand.patternSizeMode === "fixed" ? 128 : 24)}
                  onChange={(e) =>
                    patch({ patternSize: Number(e.target.value) || 24 })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={tFields("patternTint")}
                  value={brand.patternTint || "none"}
                  onChange={(e) =>
                    patch({ patternTint: e.target.value as PatternTint })
                  }
                >
                  <option value="none">{tFields("tintNone")}</option>
                  <option value="primary">{tFields("primary")}</option>
                  <option value="secondary">{tFields("secondary")}</option>
                  <option value="tertiary">{tFields("tertiary")}</option>
                  <option value="custom">{tFields("tintCustom")}</option>
                </Select>
                <Input
                  label={tFields("patternTintOpacity")}
                  type="number"
                  min={0}
                  max={100}
                  value={brand.patternTintOpacity ?? 55}
                  onChange={(e) =>
                    patch({ patternTintOpacity: Number(e.target.value) || 0 })
                  }
                />
              </div>

              {brand.patternTint === "custom" ? (
                <ColorField
                  label={tFields("patternTintColor")}
                  value={brand.patternTintColor || primaryPaint.solid}
                  onChange={(patternTintColor) => patch({ patternTintColor })}
                />
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={tFields("bgAnimation")}
                  value={brand.bgAnimation || "none"}
                  onChange={(e) =>
                    patch({ bgAnimation: e.target.value as BgAnimation })
                  }
                >
                  <option value="none">{tFields("animNone")}</option>
                  <option value="wave">{tFields("animWave")}</option>
                  <option value="beam">{tFields("animBeam")}</option>
                  <option value="aurora">{tFields("animAurora")}</option>
                  <option value="pulse">{tFields("animPulse")}</option>
                </Select>
                <Input
                  label={tFields("bgAnimationSpeed")}
                  type="number"
                  min={1}
                  max={10}
                  value={brand.bgAnimationSpeed ?? 3}
                  onChange={(e) =>
                    patch({ bgAnimationSpeed: Number(e.target.value) || 3 })
                  }
                  hint={tFields("bgAnimationSpeedHint")}
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
            {themeLabel(brand.themePreset || "violet")}
          </Badge>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5">
          <BrandBackdrop
            animation={brand.bgAnimation || "none"}
            patternUrl={brand.patternUrl}
            patternTintActive={
              Boolean(brand.patternTint && brand.patternTint !== "none")
            }
            intensity={0.55}
          />
          <div className="relative z-[1]">
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
                    color: primaryPaint.solid,
                    fontFamily: brand.fontFamily || undefined,
                  }}
                >
                  {brand.lobbyTitle || brand.wordmark || t("yourRoom")}
                </p>
                <p
                  className="text-xs"
                  style={{
                    color: secondaryPaint.solid,
                    fontFamily: brand.fontFamily || undefined,
                  }}
                >
                  {brand.lobbySubtitle || t("defaultSubtitle")}
                </p>
              </div>
            </div>
            <RoomPreview />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
