import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { BrandShowcase } from "@/components/landing/BrandShowcase";
import { CopilotFlow } from "@/components/landing/CopilotFlow";
import { FinalCta, Infra, SiteFooter } from "@/components/landing/Infra";
import { Button } from "@/components/ui/Button";

export default async function HomePage() {
  const t = await getTranslations("header");

  return (
    <>
      <SiteHeader
        actions={
          <Link href="/dashboard">
            <Button size="sm">{t("enter")}</Button>
          </Link>
        }
      />
      <main>
        <Hero />
        <Features />
        <BrandShowcase />
        <CopilotFlow />
        <Infra />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
