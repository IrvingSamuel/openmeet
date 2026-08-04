"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn, initials } from "@/lib/utils";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import {
  Aurora,
  EASE_OUT_EXPO,
  Reveal,
  morphTransition,
  springSoft,
} from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Surface";
import {
  IconArrowRight,
  IconMic,
  IconMicOff,
  IconShield,
  IconVideo,
  IconVideoOff,
} from "@/components/ui/icons";

type Devices = { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] };

export type JoinOptions = {
  displayName: string;
  videoDeviceId?: string;
  audioDeviceId?: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
};

export function Lobby({
  title,
  subtitle,
  logoUrl,
  onJoin,
  requireLogin,
  showHostLoginHint,
  isLoggedIn,
  joining,
  waiting,
  error,
  onCancelWait,
}: {
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  requireLogin?: boolean;
  /** Invite rooms: hint that the host must sign in to manage approvals. */
  showHostLoginHint?: boolean;
  isLoggedIn?: boolean;
  joining?: boolean;
  waiting?: boolean;
  error?: string | null;
  onJoin: (opts: JoinOptions) => void;
  onCancelWait?: () => void;
}) {
  const t = useTranslations("lobby");
  const [name, setName] = useState("");
  const [devices, setDevices] = useState<Devices>({ cameras: [], mics: [] });
  const [videoDeviceId, setVideoDeviceId] = useState("");
  const [audioDeviceId, setAudioDeviceId] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [permission, setPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const level = useAudioLevel(stream, audioEnabled);

  useEffect(() => {
    const stored = window.localStorage.getItem("chronos-meet:display-name");
    if (stored) setName(stored);
  }, []);

  const attach = useCallback(async () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      });
      streamRef.current = next;
      setStream(next);
      setPermission("granted");
      if (videoRef.current) videoRef.current.srcObject = next;
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        cameras: all.filter((d) => d.kind === "videoinput"),
        mics: all.filter((d) => d.kind === "audioinput"),
      });
    } catch {
      setPermission("denied");
      setStream(null);
    }
  }, [videoDeviceId, audioDeviceId]);

  useEffect(() => {
    attach();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [attach]);

  useEffect(() => {
    streamRef.current
      ?.getVideoTracks()
      .forEach((track) => {
        track.enabled = videoEnabled;
      });
  }, [videoEnabled]);

  useEffect(() => {
    streamRef.current
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = audioEnabled;
      });
  }, [audioEnabled]);

  // Restore preview after a failed join attempt (tracks were never stopped on
  // submit, but device enumeration / attach may still need a nudge).
  useEffect(() => {
    if (!error || joining) return;
    if (permission === "granted" && streamRef.current) return;
    attach();
  }, [error, joining, permission, attach]);

  const canJoin =
    name.trim().length > 0 && (!requireLogin || isLoggedIn) && !joining;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canJoin) return;
    window.localStorage.setItem("chronos-meet:display-name", name.trim());
    // Do NOT stop tracks here — LiveKit re-acquires on mount. Stopping early
    // (before the token round-trip) causes NotReadableError / blank camera.
    onJoin({
      displayName: name.trim(),
      videoDeviceId: videoDeviceId || undefined,
      audioDeviceId: audioDeviceId || undefined,
      videoEnabled,
      audioEnabled,
    });
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-5 py-12">
      <Aurora intensity={0.75} />

      <motion.div
        initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
        className="relative w-full max-w-5xl"
      >
        <header className="mb-8 flex flex-col items-center text-center">
          {logoUrl ? (
            <motion.img
              layoutId="brand-logo"
              src={logoUrl}
              alt=""
              className="mb-5 h-12 object-contain"
            />
          ) : null}
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-lg text-pretty text-sm text-ink-muted">
              {subtitle}
            </p>
          ) : null}
          <Badge tone="brand" pulse className="mt-4">
            <IconShield className="h-3.5 w-3.5" />
            {t("encryptedBadge")}
          </Badge>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <motion.div
            layoutId="stage-surface"
            transition={morphTransition}
            className="relative aspect-video overflow-hidden rounded-3xl border border-line-strong bg-black/60 shadow-lift"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={cn(
                "h-full w-full -scale-x-100 object-cover transition-opacity duration-500",
                videoEnabled && permission === "granted"
                  ? "opacity-100"
                  : "opacity-0",
              )}
            />

            <AnimatePresence>
              {!videoEnabled || permission !== "granted" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center"
                >
                  <div className="text-center">
                    <motion.div
                      animate={{ scale: [1, 1.04, 1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-gradient text-xl font-semibold text-white shadow-glow"
                    >
                      {initials(name) === "?" ? (
                        <IconVideoOff className="h-7 w-7" />
                      ) : (
                        initials(name)
                      )}
                    </motion.div>
                    <p className="mt-4 text-sm text-ink-muted">
                      {permission === "denied"
                        ? t("cameraBlocked")
                        : permission === "pending"
                          ? t("requestingDevices")
                          : t("cameraOff")}
                    </p>
                    {permission === "denied" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={attach}
                      >
                        {t("tryAgain")}
                      </Button>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* speaking ring */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl"
              animate={{
                boxShadow:
                  audioEnabled && level > 0.06
                    ? `inset 0 0 0 ${1 + level * 4}px color-mix(in srgb, var(--brand-secondary) ${
                        30 + level * 60
                      }%, transparent)`
                    : "inset 0 0 0 0px transparent",
              }}
              transition={{ duration: 0.12 }}
            />

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-4">
              <AudioMeter level={level} muted={!audioEnabled} />
              <div className="flex gap-2">
                <DeviceToggle
                  active={audioEnabled}
                  onClick={() => setAudioEnabled((v) => !v)}
                  label={audioEnabled ? t("muteMic") : t("unmuteMic")}
                  on={<IconMic className="h-4 w-4" />}
                  off={<IconMicOff className="h-4 w-4" />}
                />
                <DeviceToggle
                  active={videoEnabled}
                  onClick={() => setVideoEnabled((v) => !v)}
                  label={videoEnabled ? t("turnOffCam") : t("turnOnCam")}
                  on={<IconVideo className="h-4 w-4" />}
                  off={<IconVideoOff className="h-4 w-4" />}
                />
              </div>
            </div>
          </motion.div>

          <Reveal delay={0.08}>
            <form
              onSubmit={submit}
              className="flex h-full flex-col gap-4 rounded-3xl glass p-6"
            >
              <Input
                required
                autoFocus
                label={t("yourName")}
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <Select
                label={t("camera")}
                value={videoDeviceId}
                onChange={(e) => setVideoDeviceId(e.target.value)}
                disabled={permission !== "granted"}
              >
                <option value="">{t("systemDefault")}</option>
                {devices.cameras.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || t("cameraN", { n: i + 1 })}
                  </option>
                ))}
              </Select>
              <Select
                label={t("microphone")}
                value={audioDeviceId}
                onChange={(e) => setAudioDeviceId(e.target.value)}
                disabled={permission !== "granted"}
              >
                <option value="">{t("systemDefault")}</option>
                {devices.mics.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || t("micN", { n: i + 1 })}
                  </option>
                ))}
              </Select>

              <AnimatePresence>
                {error ? (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
                  >
                    {error}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {waiting ? (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-50"
                  >
                    <p className="font-medium">{t("waitingApprovalTitle")}</p>
                    <p className="mt-1 text-[12px] text-amber-100/80">
                      {t("waitingApprovalBody")}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {showHostLoginHint && !waiting ? (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-line bg-surface-2/60 px-3 py-3 text-sm text-ink-muted"
                  >
                    <p className="font-medium text-ink">{t("hostLoginHintTitle")}</p>
                    <p className="mt-1 text-[12px] text-ink-faint">
                      {t("hostLoginHintBody")}
                    </p>
                    <a href="/api/auth/login" className="mt-2 inline-block">
                      <Button type="button" size="sm" variant="outline">
                        {t("loginChronos")}
                      </Button>
                    </a>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="mt-auto pt-2">
                {requireLogin && !isLoggedIn ? (
                  <a href="/api/auth/login">
                    <Button full size="lg" iconRight={<IconArrowRight />}>
                      {t("loginChronos")}
                    </Button>
                  </a>
                ) : waiting ? (
                  <Button
                    type="button"
                    full
                    size="lg"
                    variant="outline"
                    onClick={onCancelWait}
                  >
                    {t("cancelRequest")}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    full
                    size="lg"
                    loading={joining}
                    disabled={!canJoin}
                    iconRight={joining ? undefined : <IconArrowRight />}
                  >
                    {joining ? t("joining") : t("joinMeeting")}
                  </Button>
                )}
                <p className="mt-3 text-center text-[11px] text-ink-faint">
                  {t("transcriptConsent")}
                </p>
              </div>
            </form>
          </Reveal>
        </div>
      </motion.div>
    </div>
  );
}

function DeviceToggle({
  active,
  onClick,
  label,
  on,
  off,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  on: React.ReactNode;
  off: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={springSoft}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-xl border backdrop-blur transition-colors duration-300",
        active
          ? "border-line-strong bg-white/10 text-ink"
          : "border-rose-400/50 bg-rose-500/85 text-white",
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={active ? "on" : "off"}
          initial={{ opacity: 0, scale: 0.6, rotate: -25 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 25 }}
          transition={{ duration: 0.18 }}
        >
          {active ? on : off}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function AudioMeter({ level, muted }: { level: number; muted: boolean }) {
  const t = useTranslations("lobby");
  const bars = 14;
  return (
    <div
      className="flex items-end gap-[3px]"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-label={t("micLevel")}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const lit = !muted && level >= threshold * 0.85;
        return (
          <motion.span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-colors duration-150",
              muted
                ? "bg-white/15"
                : lit
                  ? i > bars - 4
                    ? "bg-rose-400"
                    : "bg-brand-secondary"
                  : "bg-white/20",
            )}
            animate={{ height: lit ? 6 + i * 1.3 : 5 }}
            transition={{ duration: 0.09 }}
          />
        );
      })}
    </div>
  );
}
