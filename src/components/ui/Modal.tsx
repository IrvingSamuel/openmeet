"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, springSoft } from "@/components/motion/primitives";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  layoutId,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Share with a trigger element to morph the trigger into the dialog. */
  layoutId?: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            layoutId={layoutId}
            initial={layoutId ? undefined : { opacity: 0, scale: 0.94, y: 24 }}
            animate={layoutId ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={layoutId ? springSoft : { duration: 0.4, ease: EASE_OUT_EXPO }}
            className={cn(
              "relative z-10 w-full max-w-lg max-h-[min(90dvh,640px)] overflow-y-auto overflow-x-hidden rounded-3xl glass-strong shadow-lift",
              className,
            )}
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-secondary to-transparent"
            />
            {title || description ? (
              <motion.header
                className="space-y-1 px-6 pb-4 pt-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.4 }}
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-lg font-semibold tracking-tight text-ink">
                    {title}
                  </h2>
                  <button
                    onClick={onClose}
                    aria-label="Fechar"
                    className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </div>
                {description ? (
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {description}
                  </p>
                ) : null}
              </motion.header>
            ) : null}
            <motion.div
              className="px-6 pb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.4 }}
            >
              {children}
            </motion.div>
            {footer ? (
              <div className="border-t border-line bg-black/20 px-6 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
