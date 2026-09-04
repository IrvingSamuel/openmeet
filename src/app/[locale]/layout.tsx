import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { HtmlLang } from "@/components/layout/HtmlLang";
import { SystemThemeProvider } from "@/components/layout/SystemThemeProvider";

const OG_LOCALE: Record<AppLocale, string> = {
  en: "en_US",
  pt: "pt_BR",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw)
    ? (raw as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: {
      default: t("title"),
      template: t("titleTemplate"),
    },
    description: t("description"),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      locale: OG_LOCALE[locale],
      siteName: "OpenMeet",
      type: "website",
      images: [
        {
          url: "/OpenMeet_Logo.png",
          width: 1000,
          height: 1000,
          alt: "OpenMeet",
        },
      ],
    },
    twitter: {
      card: "summary",
      images: ["/OpenMeet_Logo.png"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <HtmlLang locale={locale} />
      <SystemThemeProvider>{children}</SystemThemeProvider>
    </NextIntlClientProvider>
  );
}
