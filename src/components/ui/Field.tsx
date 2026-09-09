"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconCheck, IconCopy } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** Normalize to #rrggbb for `<input type="color">`; keep typing flexible in the hex field. */
export function toColorInputValue(raw: string, fallback = "#000000"): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1]!;
    const g = v[2]!;
    const b = v[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

const CONTROL =
  "w-full rounded-xl border border-line bg-black/30 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint " +
  "outline-none transition-all duration-300 " +
  "hover:border-line-strong focus:border-brand-primary focus:bg-black/45 " +
  "focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand-primary)_18%,transparent)]";

function Shell({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
        >
          {label}
        </label>
      ) : null}
      {children}
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="text-xs text-rose-400"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-ink-faint"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export type InputProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  icon?: ReactNode;
  wrapperClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, wrapperClassName, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Shell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fieldId}
      className={wrapperClassName}
    >
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL,
            icon && "pl-10",
            error && "border-rose-500/60",
            className,
          )}
          {...rest}
        />
      </div>
    </Shell>
  );
});

export type SelectProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, hint, error, className, wrapperClassName, id, children, ...rest },
    ref,
  ) {
    const autoId = useId();
    const fieldId = id || autoId;
    return (
      <Shell
        label={label}
        hint={hint}
        error={error}
        htmlFor={fieldId}
        className={wrapperClassName}
      >
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            className={cn(CONTROL, "appearance-none pr-9", className)}
            {...rest}
          >
            {children}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </Shell>
    );
  },
);

export type TextareaProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, className, wrapperClassName, id, ...rest },
    ref,
  ) {
    const autoId = useId();
    const fieldId = id || autoId;
    return (
      <Shell
        label={label}
        hint={hint}
        error={error}
        htmlFor={fieldId}
        className={wrapperClassName}
      >
        <textarea
          ref={ref}
          id={fieldId}
          className={cn(CONTROL, "min-h-24 resize-y font-mono text-xs", className)}
          {...rest}
        />
      </Shell>
    );
  },
);

export function ColorField({
  label,
  value,
  onChange,
  className,
  copyLabel = "Copy hex",
  copiedLabel = "Copied",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  copyLabel?: string;
  copiedLabel?: string;
}) {
  const id = useId();
  const hexId = `${id}-hex`;
  const [copied, setCopied] = useState(false);
  const pickerValue = toColorInputValue(value, "#000000");
  const displayHex = value?.trim() ? value.trim() : pickerValue;

  async function copyHex() {
    try {
      await navigator.clipboard.writeText(displayHex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore — clipboard may be denied */
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={hexId}
        className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
      >
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-black/30 p-1.5 transition-colors hover:border-line-strong focus-within:border-brand-primary">
        <label
          htmlFor={id}
          className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/20 shadow-inner"
          title={label}
        >
          <motion.span
            className="absolute inset-0"
            style={{ background: pickerValue }}
            animate={{ background: pickerValue }}
            transition={{ duration: 0.25 }}
          />
          <input
            id={id}
            type="color"
            value={pickerValue}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} picker`}
          />
        </label>
        <input
          id={hexId}
          value={displayHex}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(toColorInputValue(displayHex, pickerValue))}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs uppercase tracking-wide text-ink outline-none"
          aria-label={`${label} hex`}
          placeholder="#000000"
        />
        <button
          type="button"
          onClick={() => void copyHex()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
        >
          {copied ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />}
        </button>
      </div>
    </div>
  );
}
