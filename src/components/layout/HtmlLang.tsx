"use client";

import { useEffect } from "react";

/**
 * The root layout serves the right <html lang>, but it is not re-rendered when
 * LanguageSwitcher changes locale with a client navigation, so sync it here.
 */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
