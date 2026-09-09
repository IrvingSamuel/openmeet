import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { HtmlLang } from "@/components/layout/HtmlLang";
import { SystemThemeProvider } from "@/components/layout/SystemThemeProvider";
import { resolveSystemUiTheme } from "@/lib/system-theme";

export const dynamic = "force-dynamic";

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
  const theme = await resolveSystemUiTheme();
  const name = theme.wordmark;
  const logo = theme.logoUrl || "/OpenMeet_Logo.png";

  return {
    title: {
      default: t("title", { name }),
      template: t("titleTemplate", { name }),
    },
    description: t("description", { name }),
    applicationName: name,
    openGraph: {
      title: t("ogTitle", { name }),
      description: t("ogDescription", { name }),
      locale: OG_LOCALE[locale],
      siteName: name,
      type: "website",
      images: [
        {
          url: logo,
          width: 1000,
          height: 1000,
          alt: name,
        },
      ],
    },
    twitter: {
      card: "summary",
      images: [logo],
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
  const theme = await resolveSystemUiTheme();

  return (
    <NextIntlClientProvider messages={messages}>
      <HtmlLang locale={locale} />
      <SystemThemeProvider theme={theme}>{children}</SystemThemeProvider>
    </NextIntlClientProvider>
  );
}
