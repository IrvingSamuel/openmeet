"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { Aurora, PageTransition } from "@/components/motion/primitives";

type Me = {
  isLoggedIn?: boolean;
  needsSetup?: boolean;
  oidcEnabled?: boolean;
  signupAllowed?: boolean;
};

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: Me) => {
        setMe(data);
        if (data.needsSetup) router.replace("/setup");
        if (data.isLoggedIn) router.replace("/dashboard");
      })
      .catch(() => setMe({}));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, name: name || undefined };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "auth_failed");
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
        <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
          <div className="mb-8 flex items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <Wordmark className="text-xl" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "login" ? t("loginTitle") : t("registerTitle")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("loginSubtitle")}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "register" ? (
              <Input
                label={t("name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            ) : null}
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {error ? (
              <p className="text-sm text-rose-400">{t(`errors.${error}` as never) || error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("working") : mode === "login" ? t("signIn") : t("signUp")}
            </Button>
          </form>

          {me?.oidcEnabled ? (
            <a
              href="/api/auth/oidc/login"
              className="mt-4 block text-center text-sm text-brand-primary underline-offset-4 hover:underline"
            >
              {t("signInOidc")}
            </a>
          ) : null}

          {me?.signupAllowed ? (
            <button
              type="button"
              className="mt-6 text-sm text-ink-muted hover:text-ink"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? t("needAccount") : t("haveAccount")}
            </button>
          ) : null}
        </div>
      </div>
    </PageTransition>
  );
}
