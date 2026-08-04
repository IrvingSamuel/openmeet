"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { routing, type AppLocale } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

function FlagUs({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden>
      <rect width="16" height="12" fill="#B22234" rx="1" />
      <path
        fill="#fff"
        d="M0 1.3h16v1.3H0zm0 2.6h16v1.3H0zm0 2.6h16v1.3H0zm0 2.6h16V11H0z"
      />
      <rect width="7.2" height="6.5" fill="#3C3B6E" rx="1" />
    </svg>
  );
}

function FlagBr({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden>
      <rect width="16" height="12" fill="#009B3A" rx="1" />
      <path fill="#FEDF00" d="M8 1.2 14.5 6 8 10.8 1.5 6z" />
      <circle cx="8" cy="6" r="2.35" fill="#002776" />
      <path
        fill="#fff"
        d="M5.9 5.55c.7-.45 2.55-.7 3.85-.25.05.4.05.8 0 1.15-1.35-.5-3.05-.25-3.8.25-.1-.35-.1-.75-.05-1.15z"
      />
    </svg>
  );
}

function FlagEs({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden>
      <rect width="16" height="12" fill="#AA151B" rx="1" />
      <rect y="3" width="16" height="6" fill="#F1BF00" />
    </svg>
  );
}

function FlagFr({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden>
      <rect width="16" height="12" fill="#fff" rx="1" />
      <rect width="5.4" height="12" fill="#002395" />
      <rect x="10.6" width="5.4" height="12" fill="#ED2939" />
    </svg>
  );
}

function FlagDe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden>
      <rect width="16" height="4" fill="#000" rx="1" />
      <rect y="4" width="16" height="4" fill="#D00" />
      <rect y="8" width="16" height="4" fill="#FFCE00" />
    </svg>
  );
}

const LOCALE_OPTIONS: Record<
  AppLocale,
  { label: string; Flag: (p: { className?: string }) => ReactNode }
> = {
  en: { label: "EN", Flag: FlagUs },
  pt: { label: "PT", Flag: FlagBr },
  es: { label: "ES", Flag: FlagEs },
  fr: { label: "FR", Flag: FlagFr },
  de: { label: "DE", Flag: FlagDe },
};

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const current = LOCALE_OPTIONS[locale] ?? LOCALE_OPTIONS.en;
  const CurrentFlag = current.Flag;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function selectLocale(next: AppLocale) {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative inline-flex items-center gap-1.5 text-[12px] text-ink-muted",
        pending && "opacity-60",
        className,
      )}
    >
      {!compact ? (
        <span className="sr-only sm:not-sr-only sm:inline">
          {t("language.label")}
        </span>
      ) : null}
      <button
        type="button"
        aria-label={t("language.label")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-ink outline-none transition-colors",
          "hover:border-line-strong hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-brand-secondary/40",
        )}
      >
        <CurrentFlag className="h-3 w-4 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" />
        <span>{current.label}</span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={cn(
            "h-3 w-3 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="m2.5 4.5 3.5 3 3.5-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("language.label")}
          className="absolute right-0 top-[calc(100%+6px)] z-[60] min-w-[7.5rem] overflow-hidden rounded-xl border border-line bg-[#0b0d1a]/95 p-1 shadow-xl backdrop-blur-md"
        >
          {routing.locales.map((code) => {
            const opt = LOCALE_OPTIONS[code];
            const Flag = opt.Flag;
            const selected = code === locale;
            return (
              <li key={code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => selectLocale(code)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-ink transition-colors",
                    selected
                      ? "bg-white/[0.1]"
                      : "hover:bg-white/[0.06]",
                  )}
                >
                  <Flag className="h-3 w-4 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" />
                  <span>{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
