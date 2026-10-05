"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Aurora, PageTransition } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useToast } from "@/components/ui/Toast";

export default function UnlockPage() {
  const t = useTranslations("accessUnlock");
  const toast = useToast();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/access/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(
          data.error === "invalid_key"
            ? t("invalidKey")
            : data.error === "key_not_configured"
              ? t("notConfigured")
              : t("failed"),
        );
        return;
      }
      toast.success(t("success"));
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/")) {
        window.location.assign(next);
      } else {
        router.push("/dashboard");
      }
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <Aurora intensity={0.35} />
      <PageTransition className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-9" />
            <Wordmark className="text-lg" />
          </div>
          <LanguageSwitcher />
        </div>
        <form
          onSubmit={submit}
          className="space-y-5 rounded-3xl border border-line bg-black/30 p-6 backdrop-blur-md"
        >
          <div>
            <h1 className="text-xl font-semibold text-ink">{t("title")}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t("body")}</p>
          </div>
          <Input
            label={t("keyLabel")}
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("keyPlaceholder")}
          />
          <Button type="submit" disabled={busy || !key.trim()} className="w-full">
            {busy ? t("submitting") : t("submit")}
          </Button>
        </form>
      </PageTransition>
    </div>
  );
}
