"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PRESET_REACTION_EMOJIS, sanitizeEmoji } from "@/lib/room-reactions";

export function ReactionPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  const t = useTranslations("room.reactions");
  const inputRef = useRef<HTMLInputElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  function submitCustom() {
    const emoji = sanitizeEmoji(customValue);
    if (!emoji) return;
    onPick(emoji);
    setCustomValue("");
    setCustomOpen(false);
  }

  return (
    <div className="w-[min(280px,88vw)] p-2">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {t("pickReaction")}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {PRESET_REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className={cn(
              "grid h-11 w-full place-items-center rounded-xl text-2xl transition-transform",
              "hover:scale-110 hover:bg-white/[0.08] active:scale-95",
            )}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="mt-2 border-t border-line pt-2">
        {customOpen ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCustom();
                if (e.key === "Escape") {
                  setCustomOpen(false);
                  setCustomValue("");
                }
              }}
              placeholder={t("customEmojiPlaceholder")}
              className="min-w-0 flex-1 rounded-xl border border-line bg-white/[0.04] px-3 py-2 text-lg outline-none focus:border-brand-secondary/50"
              autoFocus
            />
            <button
              type="button"
              onClick={submitCustom}
              className="shrink-0 rounded-xl bg-brand-primary/25 px-3 py-2 text-sm font-medium text-ink hover:bg-brand-primary/35"
            >
              {t("send")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCustomOpen(true);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-lg">
              +
            </span>
            {t("customEmoji")}
          </button>
        )}
      </div>
    </div>
  );
}
