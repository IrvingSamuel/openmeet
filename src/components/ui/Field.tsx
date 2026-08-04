"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
      >
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-black/30 p-1.5 transition-colors hover:border-line-strong focus-within:border-brand-primary">
        <motion.span
          layout
          className="h-8 w-8 shrink-0 rounded-lg border border-white/20 shadow-inner"
          style={{ background: value }}
          animate={{ background: value }}
          transition={{ duration: 0.35 }}
        />
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={`${label} seletor`}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full bg-transparent font-mono text-xs uppercase text-ink outline-none"
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}
