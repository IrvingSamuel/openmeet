"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Aurora,
  PageTransition,
  Reveal,
  morphTransition,
} from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconCopy,
  IconFileText,
  IconSettings,
  IconShield,
  IconSparkles,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  exampleWebhookHeaders,
  exampleWebhookPayload,
  type OutboundWebhookEvent,
} from "@/lib/webhook-payloads";

type SecretMask = {
  configured: boolean;
  preview: string | null;
  source?: string;
};

type WebhookEvents = {
  transcript: boolean;
  chat: boolean;
  summary: boolean;
  tasks: boolean;
};

type AdminSettings = {
  locale: string;
  geminiApiKey: SecretMask;
  geminiModel: string;
  geminiSummaryModel: string;
  deepgramApiKey: SecretMask;
  deepgramNote?: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: SecretMask;
  webhookEvents: WebhookEvents;
};

type Me = {
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  isAdmin?: boolean;
};

const TABS = [
  { key: "general", icon: IconSettings },
  { key: "ai", icon: IconSparkles },
  { key: "webhooks", icon: IconBolt },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const EVENT_META: Array<{
  key: keyof WebhookEvents;
  event: OutboundWebhookEvent;
}> = [
  { key: "transcript", event: "transcript.ready" },
  { key: "chat", event: "chat.ready" },
  { key: "summary", event: "summary.ready" },
  { key: "tasks", event: "tasks.generated" },
];

const AI_LOCALES = ["pt-BR", "en", "es", "fr", "de"] as const;

export default function AdminPage() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [tab, setTab] = useState<TabKey>("general");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<OutboundWebhookEvent | null>(null);

  // Editable drafts for secrets (empty = keep existing)
  const [geminiKeyDraft, setGeminiKeyDraft] = useState("");
  const [deepgramKeyDraft, setDeepgramKeyDraft] = useState("");
  const [webhookSecretDraft, setWebhookSecretDraft] = useState("");
  const [exampleEvent, setExampleEvent] =
    useState<OutboundWebhookEvent>("summary.ready");

  const load = useCallback(async () => {
    const meData: Me = await fetch("/api/auth/me").then((r) => r.json());
    setMe(meData);
    if (!meData.isLoggedIn || !meData.isAdmin) {
      setSettings(null);
      return;
    }
    const res = await fetch("/api/admin/settings");
    if (!res.ok) {
      throw new Error("settings_load_failed");
    }
    const data = (await res.json()) as AdminSettings;
    setSettings(data);
  }, []);

  useEffect(() => {
    load().catch(() => toast.error(t("loadFailed")));
  }, [load, toast, t]);

  const examplePayload = useMemo(
    () => exampleWebhookPayload(exampleEvent),
    [exampleEvent],
  );

  const exampleBody = useMemo(
    () => JSON.stringify(examplePayload, null, 2),
    [examplePayload],
  );

  const exampleHeaders = useMemo(
    () => exampleWebhookHeaders(exampleEvent),
    [exampleEvent],
  );

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("saveFailed"));
        return;
      }
      setSettings(data as AdminSettings);
      setGeminiKeyDraft("");
      setDeepgramKeyDraft("");
      setWebhookSecretDraft("");
      toast.success(t("saved"));
    } catch {
      toast.error(t("networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function saveGeneral() {
    if (!settings) return;
    await save({ locale: settings.locale });
  }

  async function saveAi() {
    if (!settings) return;
    const patch: Record<string, unknown> = {
      geminiModel: settings.geminiModel || null,
      geminiSummaryModel: settings.geminiSummaryModel || null,
    };
    if (geminiKeyDraft.trim()) patch.geminiApiKey = geminiKeyDraft.trim();
    if (deepgramKeyDraft.trim()) patch.deepgramApiKey = deepgramKeyDraft.trim();
    await save(patch);
  }

  async function clearGeminiKey() {
    await save({ geminiApiKey: null });
  }

  async function clearDeepgramKey() {
    await save({ deepgramApiKey: null });
  }

  async function saveWebhooks() {
    if (!settings) return;
    const patch: Record<string, unknown> = {
      webhookEnabled: settings.webhookEnabled,
      webhookUrl: settings.webhookUrl || null,
      webhookEvents: settings.webhookEvents,
    };
    if (webhookSecretDraft.trim()) {
      patch.webhookSecret = webhookSecretDraft.trim();
    }
    await save(patch);
  }

  async function clearWebhookSecret() {
    await save({ webhookSecret: null });
  }

  async function runTest(event: OutboundWebhookEvent) {
    setTesting(event);
    try {
      const res = await fetch("/api/admin/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("testFailed"));
        return;
      }
      toast.success(
        t("testSuccess", { event, status: data.status ?? 200 }),
      );
    } catch {
      toast.error(t("testNetworkFailed"));
    } finally {
      setTesting(null);
    }
  }

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(
        `${exampleHeaders}\n\n${exampleBody}`,
      );
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  if (me === null) {
    return (
      <Shell>
        <Skeleton className="mt-12 h-10 w-72" />
        <Skeleton className="mt-8 h-96 w-full rounded-3xl" />
      </Shell>
    );
  }

  if (!me.isLoggedIn) {
    return (
      <Shell>
        <Reveal className="mx-auto mt-24 max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("sessionRequired.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t("sessionRequired.body")}
          </p>
          <a href="/api/auth/login" className="mt-6 inline-block">
            <Button iconRight={<IconArrowRight className="h-4 w-4" />}>
              {t("sessionRequired.login")}
            </Button>
          </a>
        </Reveal>
      </Shell>
    );
  }

  if (!me.isAdmin) {
    return (
      <Shell>
        <Reveal className="mx-auto mt-24 max-w-md text-center">
          <IconShield className="mx-auto h-10 w-10 text-ink-faint" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {t("forbidden.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t.rich("forbidden.body", {
              code: (chunks) => (
                <code className="text-xs text-brand-secondary">{chunks}</code>
              ),
            })}
          </p>
          <Link href="/dashboard" className="mt-6 inline-block">
            <Button variant="outline">{t("forbidden.back")}</Button>
          </Link>
        </Reveal>
      </Shell>
    );
  }

  if (!settings) {
    return (
      <Shell>
        <Skeleton className="mt-12 h-10 w-72" />
        <Skeleton className="mt-8 h-96 w-full rounded-3xl" />
      </Shell>
    );
  }

  return (
    <Shell>
      <Reveal className="mt-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-secondary">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          {t("description")}
        </p>
      </Reveal>

      <div className="mt-10 rounded-3xl glass p-6">
        <div className="flex flex-wrap gap-1 border-b border-line pb-3">
          {TABS.map((tabItem) => {
            const Icon = tabItem.icon;
            const active = tab === tabItem.key;
            return (
              <button
                key={tabItem.key}
                type="button"
                onClick={() => setTab(tabItem.key)}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-ink"
                    : "text-ink-faint hover:text-ink-muted",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="admin-tab"
                    className="absolute inset-0 rounded-xl bg-white/8"
                    transition={morphTransition}
                  />
                ) : null}
                <Icon className="relative h-4 w-4" />
                <span className="relative">{t(`tabs.${tabItem.key}`)}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-6"
          >
            {tab === "general" ? (
              <div className="max-w-lg space-y-5">
                <Select
                  label={t("general.localeLabel")}
                  value={settings.locale}
                  onChange={(e) =>
                    setSettings({ ...settings, locale: e.target.value })
                  }
                  hint={t("general.localeHint")}
                >
                  {AI_LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {t(`general.locales.${code}`)}
                    </option>
                  ))}
                </Select>
                <Button onClick={saveGeneral} disabled={saving}>
                  {saving ? t("saving") : t("general.save")}
                </Button>
              </div>
            ) : null}

            {tab === "ai" ? (
              <div className="max-w-xl space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={settings.geminiApiKey.configured ? "success" : "warn"}>
                    Gemini{" "}
                    {settings.geminiApiKey.configured
                      ? t("viaSource", {
                          source: settings.geminiApiKey.source ?? "config",
                        })
                      : t("notConfigured")}
                  </Badge>
                  {settings.geminiApiKey.preview ? (
                    <span className="font-mono text-xs text-ink-faint">
                      {settings.geminiApiKey.preview}
                    </span>
                  ) : null}
                </div>
                <Input
                  label={t("ai.geminiKeyLabel")}
                  type="password"
                  autoComplete="off"
                  value={geminiKeyDraft}
                  onChange={(e) => setGeminiKeyDraft(e.target.value)}
                  hint={t("ai.geminiKeyHint")}
                  placeholder={t("ai.geminiKeyPlaceholder")}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={t("ai.modelInsights")}
                    value={settings.geminiModel}
                    onChange={(e) =>
                      setSettings({ ...settings, geminiModel: e.target.value })
                    }
                    placeholder="gemini-3.5-flash-lite"
                  />
                  <Input
                    label={t("ai.modelSummary")}
                    value={settings.geminiSummaryModel}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        geminiSummaryModel: e.target.value,
                      })
                    }
                    placeholder="gemini-3.5-flash-lite"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Badge
                    tone={settings.deepgramApiKey.configured ? "success" : "warn"}
                  >
                    Deepgram{" "}
                    {settings.deepgramApiKey.configured
                      ? t("viaSource", {
                          source: settings.deepgramApiKey.source ?? "config",
                        })
                      : t("notConfigured")}
                  </Badge>
                </div>
                <Input
                  label={t("ai.deepgramKeyLabel")}
                  type="password"
                  autoComplete="off"
                  value={deepgramKeyDraft}
                  onChange={(e) => setDeepgramKeyDraft(e.target.value)}
                  hint={
                    settings.deepgramNote || t("ai.deepgramKeyHint")
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveAi} disabled={saving}>
                    {saving ? t("saving") : t("ai.save")}
                  </Button>
                  {settings.geminiApiKey.source === "db" ? (
                    <Button
                      variant="ghost"
                      onClick={clearGeminiKey}
                      disabled={saving}
                    >
                      {t("ai.clearGemini")}
                    </Button>
                  ) : null}
                  {settings.deepgramApiKey.source === "db" ? (
                    <Button
                      variant="ghost"
                      onClick={clearDeepgramKey}
                      disabled={saving}
                    >
                      {t("ai.clearDeepgram")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {tab === "webhooks" ? (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-5">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-line"
                      checked={settings.webhookEnabled}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          webhookEnabled: e.target.checked,
                        })
                      }
                    />
                    <span>{t("webhooks.enabled")}</span>
                  </label>
                  <Input
                    label={t("webhooks.urlLabel")}
                    type="url"
                    value={settings.webhookUrl}
                    onChange={(e) =>
                      setSettings({ ...settings, webhookUrl: e.target.value })
                    }
                    placeholder={t("webhooks.urlPlaceholder")}
                    hint={t("webhooks.urlHint")}
                  />
                  <Input
                    label={t("webhooks.secretLabel")}
                    type="password"
                    autoComplete="off"
                    value={webhookSecretDraft}
                    onChange={(e) => setWebhookSecretDraft(e.target.value)}
                    hint={
                      settings.webhookSecret.configured
                        ? t("webhooks.secretConfiguredHint", {
                            preview: settings.webhookSecret.preview ?? "",
                          })
                        : t("webhooks.secretHint")
                    }
                    placeholder={t("webhooks.secretPlaceholder")}
                  />
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      {t("webhooks.eventsHeading")}
                    </p>
                    {EVENT_META.map((item) => (
                      <label
                        key={item.key}
                        className="flex items-start gap-3 rounded-xl border border-line bg-black/20 p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-line"
                          checked={settings.webhookEvents[item.key]}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              webhookEvents: {
                                ...settings.webhookEvents,
                                [item.key]: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>
                          <span className="font-medium text-ink">
                            {t(`webhooks.events.${item.key}.label`)}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-faint">
                            <code>{item.event}</code> —{" "}
                            {t(`webhooks.events.${item.key}.description`)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={saveWebhooks} disabled={saving}>
                      {saving ? t("saving") : t("webhooks.save")}
                    </Button>
                    {settings.webhookSecret.configured ? (
                      <Button
                        variant="ghost"
                        onClick={clearWebhookSecret}
                        disabled={saving}
                      >
                        {t("webhooks.clearSecret")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      {t("webhooks.exampleHeading")}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<IconCopy className="h-3.5 w-3.5" />}
                      onClick={copyExample}
                    >
                      {tCommon("actions.copy")}
                    </Button>
                  </div>
                  <Select
                    label={t("webhooks.eventTypeLabel")}
                    value={exampleEvent}
                    onChange={(e) =>
                      setExampleEvent(e.target.value as OutboundWebhookEvent)
                    }
                  >
                    {EVENT_META.map((item) => (
                      <option key={item.event} value={item.event}>
                        {t("webhooks.eventOption", {
                          label: t(`webhooks.events.${item.key}.label`),
                          event: item.event,
                        })}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    label={t("webhooks.headersLabel")}
                    readOnly
                    rows={5}
                    value={exampleHeaders}
                    className="font-mono text-[11px]"
                  />
                  <Textarea
                    label={t("webhooks.bodyLabel")}
                    readOnly
                    rows={16}
                    value={exampleBody}
                    className="font-mono text-[11px]"
                  />
                  <Button
                    variant="outline"
                    icon={
                      testing === exampleEvent ? (
                        <IconCheck className="h-4 w-4" />
                      ) : (
                        <IconFileText className="h-4 w-4" />
                      )
                    }
                    disabled={!settings.webhookUrl || testing !== null}
                    onClick={() => runTest(exampleEvent)}
                  >
                    {testing === exampleEvent
                      ? t("webhooks.sending")
                      : t("webhooks.sendTest")}
                  </Button>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");

  return (
    <div className="relative min-h-screen">
      <Aurora intensity={0.5} />
      <PageTransition className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link href="/dashboard">
              <Button size="sm" variant="ghost">
                {t("backToDashboard")}
              </Button>
            </Link>
          </div>
        </header>
        {children}
      </PageTransition>
    </div>
  );
}
