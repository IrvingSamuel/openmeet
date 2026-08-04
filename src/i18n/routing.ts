import { defineRouting } from "next-intl/routing";

export const locales = ["en", "pt", "es", "fr", "de"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  localeDetection: true,
});
