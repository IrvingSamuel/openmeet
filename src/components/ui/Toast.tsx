"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { springSoft } from "@/components/motion/primitives";
import { playMeetingErrorSound } from "@/lib/meeting-sounds";
import { IconClose } from "@/components/ui/icons";

export type ToastTone = "info" | "success" | "error";

type Toast = { id: number; message: string; tone: ToastTone };

type ToastApi = {
  push: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa de <ToastProvider>");
  return ctx;
}

const TONE_STYLES: Record<ToastTone, string> = {
  info: "border-line-strong",
  success: "border-emerald-400/40",
  error: "border-rose-400/50",
};

const TONE_BAR: Record<ToastTone, string> = {
  info: "bg-brand-secondary",
  success: "bg-emerald-400",
  error: "bg-rose-400",
};

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const t = useTranslations("common.actions");
  return (
    <div
      className="pointer-events-none fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-[200] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 28, scale: 0.94, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(6px)" }}
            transition={springSoft}
            className={cn(
              "pointer-events-auto relative overflow-hidden rounded-2xl glass-strong py-3 pl-4 pr-10 text-sm text-ink shadow-lift",
              TONE_STYLES[toast.tone],
            )}
          >
            <motion.span
              aria-hidden
              className={cn(
                "absolute bottom-0 left-0 h-0.5",
                TONE_BAR[toast.tone],
              )}
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 4.2, ease: "linear" }}
            />
            <p className="pr-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={t("dismiss")}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      if (tone === "error") playMeetingErrorSound();
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      const timer = setTimeout(() => dismiss(id), 4200);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
