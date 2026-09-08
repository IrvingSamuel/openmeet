"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Align = "left" | "center" | "right";

/**
 * Renders a menu in a document.body portal with position:fixed so it paints
 * above LiveKit <video> compositor layers that ignore in-tree z-index.
 */
export function FloatingMenu({
  open,
  onClose,
  anchorRef,
  align = "center",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: Align;
  className?: string;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    bottom: number;
    left: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    // Distance from viewport bottom to the gap above the button.
    const bottom = window.innerHeight - r.top + gap;
    let left = r.left;
    if (align === "center") left = r.left + r.width / 2;
    if (align === "right") left = r.right;
    setCoords({ bottom, left });
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    update();
  }, [open, update]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, onClose, update, anchorRef]);

  if (!mounted) return null;

  const translateX =
    align === "right"
      ? "-translate-x-full"
      : align === "center"
        ? "-translate-x-1/2"
        : "";

  return createPortal(
    <AnimatePresence>
      {open && coords ? (
        <motion.div
          key="floating-menu"
          ref={menuRef}
          role="menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ bottom: coords.bottom, left: coords.left }}
          className={cn(
            "pointer-events-auto fixed z-[180] w-56 overflow-hidden rounded-2xl border border-line bg-[color-mix(in_srgb,var(--brand-bg)_92%,black)] p-1.5 shadow-lift backdrop-blur-xl",
            translateX,
            className,
          )}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
