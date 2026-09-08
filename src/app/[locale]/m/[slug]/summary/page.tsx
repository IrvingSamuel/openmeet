"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import MeetingSummaryPage from "./SummaryClient";

function SummaryFallback() {
  const t = useTranslations("summary");
  return (
    <div className="grid min-h-screen place-items-center text-sm text-ink-faint">
      {t("loading")}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<SummaryFallback />}>
      <MeetingSummaryPage />
    </Suspense>
  );
}
