"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { Aurora, PageTransition } from "@/components/motion/primitives";

export default function SetupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [deploymentMode, setDeploymentMode] = useState<"server" | "platform">(
    "platform",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needsSetup) router.replace("/login");
      })
      .catch(() => undefined);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          deploymentMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "setup_failed");
        return;
      }
      router.replace("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageTransition>
      <div className="relative min-h-screen overflow-hidden bg-surface-0 text-ink">
        <Aurora className="opacity-60" />
        <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
          <div className="mb-8 flex items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <Wordmark className="text-xl" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("setupTitle")}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t("setupSubtitle")}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Input
              label={t("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <Input
              label={t("email")}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Input
              label={t("password")}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Select
              label={t("deploymentMode")}
              value={deploymentMode}
              onChange={(e) =>
                setDeploymentMode(e.target.value as "server" | "platform")
              }
            >
              <option value="platform">{t("modePlatform")}</option>
              <option value="server">{t("modeServer")}</option>
            </Select>
            {error ? (
              <p className="text-sm text-rose-400">{t(`errors.${error}` as never) || error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("working") : t("createAdmin")}
            </Button>
          </form>
        </div>
      </div>
    </PageTransition>
  );
}
