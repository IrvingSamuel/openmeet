"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { springSoft } from "@/components/motion/primitives";
import { playMeetingErrorSound } from "@/lib/meeting-sounds";

export type ToastTone = "info" | "success" | "error";

type Toast = { id: number; message: string; tone: ToastTone };

type ToastApi = {
  push: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    if (tone === "error") playMeetingErrorSound();
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4200,
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 left-1/2 z-[200] flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 28, scale: 0.94, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(6px)" }}
              transition={springSoft}
              className={cn(
                "pointer-events-auto relative overflow-hidden rounded-2xl glass-strong px-4 py-3 text-sm text-ink shadow-lift",
                TONE_STYLES[t.tone],
              )}
            >
              <motion.span
                aria-hidden
                className={cn("absolute bottom-0 left-0 h-0.5", TONE_BAR[t.tone])}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 4.2, ease: "linear" }}
              />
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
