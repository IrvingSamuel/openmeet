"use client";

import { useEffect } from "react";

/** Syncs <html lang> when the active locale changes (root layout owns <html>). */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
