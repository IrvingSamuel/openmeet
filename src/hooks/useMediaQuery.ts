"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe matchMedia hook. Returns `false` until mounted to avoid hydration
 * mismatch, then tracks the query result.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind `lg` breakpoint (1024px). */
export function useIsLgUp(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** Tailwind `sm` breakpoint (640px). */
export function useIsSmUp(): boolean {
  return useMediaQuery("(min-width: 640px)");
}

/** Coarse pointer (touch-first devices). */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
