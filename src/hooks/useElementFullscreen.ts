"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useElementFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      setActive(document.fullscreenElement === ref.current);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return false;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const exit = useCallback(async () => {
    if (document.fullscreenElement !== ref.current) return;
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  return { ref, active, toggle, exit };
}
