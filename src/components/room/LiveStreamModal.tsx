"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { IconBroadcast } from "@/components/ui/icons";
import type {
  ActiveLiveStream,
  LiveStreamStartError,
} from "@/hooks/useLiveStream";

const DEFAULT_RTMP_URL = "rtmp://a.rtmp.youtube.com/live2";

const KNOWN_ERRORS = new Set([
  "live_disabled",
  "invalid_stream_key",
  "invalid_rtmp_url",
  "meeting_not_active",
  "egress_start_failed",
  "egress_offline",
  "stop_failed",
  "forbidden",
  "unauthorized",
]);

export function LiveStreamModal({
  open,
  onClose,
  active,
  busy,
  captionsEnabled,
  lastError,
  onStart,
  onStop,
}: {
  open: boolean;
  onClose: () => void;
  active: ActiveLiveStream;
  busy: boolean;
  captionsEnabled: boolean;
  /** Failure reported by Egress after start (e.g. RTMP rejected). */
  lastError?: string | null;
  onStart: (input: {
    streamKey: string;
    rtmpUrl?: string;
  }) => Promise<{ ok: true } | ({ ok: false } & LiveStreamStartError)>;
  onStop: () => Promise<boolean>;
}) {
  const t = useTranslations("room.liveStream");
  const [streamKey, setStreamKey] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState(DEFAULT_RTMP_URL);
  const [error, setError] = useState<LiveStreamStartError | null>(null);

  useEffect(() => {
    if (!open) {
      setStreamKey("");
      setError(null);
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!streamKey.trim()) {
      setError({ error: "invalid_stream_key" });
      return;
    }
    setError(null);
    const result = await onStart({
      streamKey: streamKey.trim(),
      rtmpUrl: rtmpUrl.trim() === DEFAULT_RTMP_URL ? undefined : rtmpUrl.trim(),
    });
    if (result.ok) {
      setStreamKey("");
      onClose();
    } else {
      setError({ error: result.error, detail: result.detail });
    }
  }

  async function stop() {
    const ok = await onStop();
    if (ok) onClose();
    else setError({ error: "stop_failed" });
  }

  const errorText = error
    ? KNOWN_ERRORS.has(error.error)
      ? t(`errors.${error.error}`)
      : t("errors.generic")
    : null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 z-[55] grid place-items-center bg-[var(--brand-bg)]/92 px-6 backdrop-blur-xl"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-stream-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl glass-strong p-7 shadow-lift"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300">
                <IconBroadcast className="h-5 w-5" />
              </span>
              <h2
                id="live-stream-title"
                className="text-lg font-semibold tracking-tight"
              >
                {active ? t("activeTitle") : t("title")}
              </h2>
            </div>

            {active ? (
              <>
                <p className="mt-3 text-sm text-ink-muted">
                  {active.status === "live"
                    ? t("activeBody")
                    : t("startingBody")}
                </p>
                {errorText ? (
                  <p className="mt-3 text-sm text-rose-300">{errorText}</p>
                ) : null}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={onClose} disabled={busy}>
                    {t("close")}
                  </Button>
                  <Button variant="danger" loading={busy} onClick={() => void stop()}>
                    {t("stop")}
                  </Button>
                </div>
              </>
            ) : (
              <form onSubmit={submit} className="mt-3 space-y-4">
                <p className="text-sm text-ink-muted">{t("body")}</p>
                {!captionsEnabled ? (
                  <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {t("captionsOff")}
                  </p>
                ) : null}
                {lastError && !error ? (
                  <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                    {t("lastFailed", { detail: lastError })}
                  </p>
                ) : null}
                <Input
                  label={t("streamKeyLabel")}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={streamKey}
                  onChange={(e) => setStreamKey(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                  hint={t("streamKeyHint")}
                  autoFocus
                />
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-muted hover:text-ink">
                    {t("advanced")}
                  </summary>
                  <div className="mt-3">
                    <Input
                      label={t("rtmpUrlLabel")}
                      value={rtmpUrl}
                      spellCheck={false}
                      onChange={(e) => setRtmpUrl(e.target.value)}
                      hint={t("rtmpUrlHint")}
                    />
                  </div>
                </details>
                {errorText ? (
                  <div className="text-sm text-rose-300">
                    <p>{errorText}</p>
                    {error?.detail ? (
                      <p className="mt-1 break-words text-xs text-rose-300/80">
                        {error.detail}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    disabled={busy}
                  >
                    {t("cancel")}
                  </Button>
                  <Button type="submit" variant="danger" loading={busy}>
                    {t("start")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
