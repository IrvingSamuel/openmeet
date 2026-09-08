"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  defaultGradientFromSolid,
  paintToCss,
  solidPaint,
  type PaintToken,
} from "@/lib/brand";
import { cn } from "@/lib/utils";
import { ColorField } from "@/components/ui/Field";

type PaintFieldProps = {
  label: string;
  value: PaintToken;
  onChange: (value: PaintToken) => void;
  /** Second color seed when switching solid → gradient */
  gradientCompanion?: string;
  className?: string;
};

export function PaintField({
  label,
  value,
  onChange,
  gradientCompanion = "#a78bfa",
  className,
}: PaintFieldProps) {
  const t = useTranslations("brand.paint");
  const modeId = useId();
  const paint = value.mode === "gradient" && value.gradient
    ? value
    : solidPaint(value.solid);

  function setMode(mode: "solid" | "gradient") {
    if (mode === "solid") {
      onChange(solidPaint(paint.solid));
      return;
    }
    if (paint.mode === "gradient" && paint.gradient) {
      onChange({ ...paint, mode: "gradient" });
      return;
    }
    onChange(defaultGradientFromSolid(paint.solid, gradientCompanion));
  }

  function setSolid(color: string) {
    if (paint.mode === "gradient" && paint.gradient) {
      const stops = paint.gradient.stops.map((s, i) =>
        i === 0 ? { ...s, color } : s,
      );
      onChange({
        mode: "gradient",
        solid: color,
        gradient: { ...paint.gradient, stops },
      });
      return;
    }
    onChange(solidPaint(color));
  }

  function setStop(index: number, color: string) {
    if (!paint.gradient) return;
    const stops = paint.gradient.stops.map((s, i) =>
      i === index ? { ...s, color } : s,
    );
    onChange({
      mode: "gradient",
      solid: index === 0 ? color : paint.solid,
      gradient: { ...paint.gradient, stops },
    });
  }

  function setAngle(angle: number) {
    if (!paint.gradient) return;
    onChange({
      ...paint,
      mode: "gradient",
      gradient: { ...paint.gradient, angle },
    });
  }

  function setType(type: "linear" | "radial") {
    if (!paint.gradient) return;
    onChange({
      ...paint,
      mode: "gradient",
      gradient: { ...paint.gradient, type },
    });
  }

  function addStop() {
    if (!paint.gradient || paint.gradient.stops.length >= 3) return;
    const mid = paint.gradient.stops[paint.gradient.stops.length - 1];
    onChange({
      ...paint,
      mode: "gradient",
      gradient: {
        ...paint.gradient,
        stops: [
          ...paint.gradient.stops.slice(0, -1),
          { color: mid.color, at: 50 },
          { ...mid, at: 100 },
        ],
      },
    });
  }

  return (
    <div className={cn("space-y-2 rounded-2xl border border-line bg-black/20 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <motion.span
            layout
            className="h-7 w-7 shrink-0 rounded-lg border border-white/20 shadow-inner"
            style={{ background: paintToCss(paint) }}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {label}
          </p>
        </div>
        <div
          id={modeId}
          className="flex rounded-lg border border-line bg-black/30 p-0.5"
          role="group"
          aria-label={t("mode")}
        >
          {(["solid", "gradient"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={paint.mode === mode}
              onClick={() => setMode(mode)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                paint.mode === mode
                  ? "bg-white/10 text-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {t(mode)}
            </button>
          ))}
        </div>
      </div>

      {paint.mode === "solid" ? (
        <ColorField label={label} value={paint.solid} onChange={setSolid} />
      ) : paint.gradient ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-line bg-black/30 p-0.5">
              {(["linear", "radial"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={paint.gradient!.type === type}
                  onClick={() => setType(type)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    paint.gradient!.type === type
                      ? "bg-white/10 text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t(type)}
                </button>
              ))}
            </div>
            {paint.gradient.type === "linear" ? (
              <label className="flex flex-1 items-center gap-2 text-[11px] text-ink-muted">
                <span>{t("angle")}</span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={paint.gradient.angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="w-full accent-[var(--brand-primary)]"
                  aria-label={t("angle")}
                />
                <span className="w-8 font-mono text-ink">{paint.gradient.angle}°</span>
              </label>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {paint.gradient.stops.map((stop, i) => (
              <ColorField
                key={i}
                label={`${t("stop")} ${i + 1}`}
                value={stop.color}
                onChange={(c) => setStop(i, c)}
              />
            ))}
          </div>
          {paint.gradient.stops.length < 3 ? (
            <button
              type="button"
              onClick={addStop}
              className="text-xs text-brand-secondary hover:underline"
            >
              {t("addStop")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
