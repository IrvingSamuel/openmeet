import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import pt from "../../messages/pt.json";

export function renderWithIntl(ui: ReactNode, locale = "pt") {
  return render(
    <NextIntlClientProvider locale={locale} messages={pt}>
      {ui}
    </NextIntlClientProvider>,
  );
}

export function withIntl(ui: ReactNode, locale = "pt") {
  return (
    <NextIntlClientProvider locale={locale} messages={pt}>
      {ui}
    </NextIntlClientProvider>
  );
}
