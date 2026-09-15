"use client";

import { useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EASE_OUT_EXPO, springSoft } from "@/components/motion/primitives";
import { deviceLabel } from "@/components/room/DeviceMenus";
import { Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useMeetingDevices } from "@/hooks/useMeetingDevices";
import {
  VIRTUAL_BACKGROUND_PRESETS,
  type MediaPrefs,
} from "@/lib/media-prefs-schema";
import { cn } from "@/lib/utils";

type OptionsTab = "general" | "captions" | "audio" | "video";

export function DeviceSettingsModal({
  open,
  onClose,
  mediaPrefs,
  mediaPrefsReady = false,
  accountBound = false,
  saving = false,
  resolvedCaptionsDefault = true,
  effectsSupported = false,
  onMediaPrefsChange,
  onUploadVirtualBackground,
}: {
  open: boolean;
  onClose: () => void;
  mediaPrefs?: MediaPrefs;
  mediaPrefsReady?: boolean;
  accountBound?: boolean;
  saving?: boolean;
  resolvedCaptionsDefault?: boolean;
  effectsSupported?: boolean;
  onMediaPrefsChange?: (patch: Partial<MediaPrefs>) => void;
  onUploadVirtualBackground?: (file: File) => Promise<string>;
}) {
  const t = useTranslations("room.controlBar");
  const tRoom = useTranslations("room");
  const room = useRoomContext();
  const toast = useToast();
  const {
    devices,
    active,
    switching,
    speakerSupported,
    refresh,
    switchCamera,
    switchMic,
    switchSpeaker,
  } = useMeetingDevices(room);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<OptionsTab>("general");
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prefs = mediaPrefs;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, refresh]);

  const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
  const micTrack = room.localParticipant.getTrackPublication(
    Track.Source.Microphone,
  )?.track;
  const videoStream = useMemo(() => {
    const track = camTrack?.mediaStreamTrack;
    return track && !camTrack?.isMuted ? new MediaStream([track]) : null;
  }, [camTrack, camTrack?.isMuted, camTrack?.mediaStreamTrack]);
  const audioStream = useMemo(() => {
    const track = micTrack?.mediaStreamTrack;
    return track && !micTrack?.isMuted ? new MediaStream([track]) : null;
  }, [micTrack, micTrack?.isMuted, micTrack?.mediaStreamTrack]);
  const level = useAudioLevel(audioStream, open && tab === "audio" && Boolean(audioStream));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = videoStream;
    if (videoStream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [videoStream, tab]);

  async function handleSwitch(
    kind: "camera" | "mic" | "speaker",
    deviceId: string,
  ) {
    try {
      if (kind === "camera") await switchCamera(deviceId);
      else if (kind === "mic") await switchMic(deviceId);
      else await switchSpeaker(deviceId);
    } catch (err) {
      toast.error(
        tRoom("mediaDeviceError", {
          label: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  async function handleUpload(file: File | undefined) {
    if (!file || !onUploadVirtualBackground || !onMediaPrefsChange) return;
    setUploading(true);
    try {
      const url = await onUploadVirtualBackground(file);
      onMediaPrefsChange({
        videoEffect: "virtual",
        virtualBackgroundUrl: url,
      });
      toast.success(t("effectsUploadOk"));
    } catch (err) {
      toast.error(
        t("effectsUploadFailed", {
          label: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!mounted) return null;

  const tabs: OptionsTab[] = ["general", "captions", "audio", "video"];

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("options")}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
            className="relative z-10 max-h-[min(90dvh,760px)] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-3xl glass-strong shadow-lift"
          >
            <header className="px-6 pb-4 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-ink">
                    {t("options")}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {t("optionsDescription")}
                  </p>
                  {mediaPrefsReady ? (
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {accountBound
                        ? saving
                          ? t("effectsSaving")
                          : t("effectsSavedAccount")
                        : t("effectsSavedBrowser")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("closeOptions")}
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-white/10 hover:text-ink"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>
            </header>

            <div
              role="tablist"
              className="mx-6 grid grid-cols-4 gap-1 rounded-xl border border-line bg-black/20 p-1"
            >
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  onClick={() => setTab(item)}
                  className={cn(
                    "rounded-lg px-2 py-2 text-sm transition-colors",
                    tab === item
                      ? "bg-white/10 text-ink"
                      : "text-ink-faint hover:text-ink",
                  )}
                >
                  {t(`optionsTabs.${item}`)}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="space-y-5 px-6 pb-6 pt-5">
              {tab === "general" && prefs && onMediaPrefsChange ? (
                <div className="space-y-4">
                  <p className="text-xs text-ink-faint">{t("tabReturnHint")}</p>
                  <Select
                    label={t("tabReturnEnabled")}
                    value={
                      prefs.tabReturnEnabled === null
                        ? "inherit"
                        : prefs.tabReturnEnabled
                          ? "on"
                          : "off"
                    }
                    onChange={(e) =>
                      onMediaPrefsChange({
                        tabReturnEnabled:
                          e.target.value === "inherit"
                            ? null
                            : e.target.value === "on",
                      })
                    }
                  >
                    <option value="inherit">{t("tabReturnOptions.inherit")}</option>
                    <option value="on">{t("tabReturnEnabledOptions.on")}</option>
                    <option value="off">{t("tabReturnEnabledOptions.off")}</option>
                  </Select>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["Mic", "Camera"] as const).map((kind) => {
                      const key = `tabReturn${kind}` as
                        | "tabReturnMic"
                        | "tabReturnCamera";
                      return (
                        <Select
                          key={key}
                          label={t(key)}
                          value={prefs[key] ?? "inherit"}
                          onChange={(e) =>
                            onMediaPrefsChange({
                              [key]:
                                e.target.value === "inherit"
                                  ? null
                                  : (e.target.value as "open" | "closed" | "restore"),
                            })
                          }
                        >
                          <option value="inherit">
                            {t("tabReturnOptions.inherit")}
                          </option>
                          <option value="closed">{t("tabReturnOptions.closed")}</option>
                          <option value="open">{t("tabReturnOptions.open")}</option>
                          <option value="restore">{t("tabReturnOptions.restore")}</option>
                        </Select>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {tab === "captions" && prefs && onMediaPrefsChange ? (
                <CheckboxRow
                  checked={
                    prefs.captionsDefault ?? resolvedCaptionsDefault
                  }
                  onChange={(checked) =>
                    onMediaPrefsChange({ captionsDefault: checked })
                  }
                  label={t("captionsStartOn")}
                  hint={t("captionsStartOnHint")}
                />
              ) : null}

              {tab === "audio" ? (
                <div className="space-y-5">
                  <Select
                    label={t("microphone")}
                    value={active.micId}
                    disabled={switching || devices.mics.length === 0}
                    onChange={(e) => void handleSwitch("mic", e.target.value)}
                  >
                    {devices.mics.length ? (
                      devices.mics.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {deviceLabel(device, index, (n) => t("micN", { n }))}
                        </option>
                      ))
                    ) : (
                      <option value="">{t("noDevices")}</option>
                    )}
                  </Select>
                  {speakerSupported ? (
                    <Select
                      label={t("speaker")}
                      value={active.speakerId}
                      disabled={switching || devices.speakers.length === 0}
                      onChange={(e) => void handleSwitch("speaker", e.target.value)}
                    >
                      {devices.speakers.length ? (
                        devices.speakers.map((device, index) => (
                          <option key={device.deviceId || index} value={device.deviceId}>
                            {deviceLabel(device, index, (n) =>
                              t("speakerN", { n }),
                            )}
                          </option>
                        ))
                      ) : (
                        <option value="">{t("noDevices")}</option>
                      )}
                    </Select>
                  ) : (
                    <p className="text-xs text-ink-faint">{t("speakerUnsupported")}</p>
                  )}
                  <div className="flex items-center gap-3 rounded-xl border border-line p-4">
                    <span className="text-xs text-ink-muted">{t("micLevel")}</span>
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                      role="meter"
                      aria-valuenow={Math.round(level * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <motion.div
                        className="h-full rounded-full bg-brand-primary"
                        animate={{ width: `${Math.max(2, level * 100)}%` }}
                        transition={springSoft}
                      />
                    </div>
                  </div>
                  {prefs && onMediaPrefsChange
                    ? (
                        [
                          ["noiseSuppression", t("effectsNoise")],
                          ["echoCancellation", t("effectsEcho")],
                          ["autoGainControl", t("effectsAgc")],
                        ] as const
                      ).map(([key, label]) => (
                        <CheckboxRow
                          key={key}
                          checked={prefs[key]}
                          onChange={(checked) => onMediaPrefsChange({ [key]: checked })}
                          label={label}
                        />
                      ))
                    : null}
                </div>
              ) : null}

              {tab === "video" ? (
                <div className="space-y-5">
                  <Select
                    label={t("camera")}
                    value={active.cameraId}
                    disabled={switching || devices.cameras.length === 0}
                    onChange={(e) => void handleSwitch("camera", e.target.value)}
                  >
                    {devices.cameras.length ? (
                      devices.cameras.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {deviceLabel(device, index, (n) => t("cameraN", { n }))}
                        </option>
                      ))
                    ) : (
                      <option value="">{t("noDevices")}</option>
                    )}
                  </Select>
                  <div className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-black/60">
                    {videoStream ? (
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        autoPlay
                        className="h-full w-full object-cover"
                        style={{ transform: "scaleX(-1)" }}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-ink-faint">
                        {t("cameraPreviewOff")}
                      </div>
                    )}
                  </div>
                  {prefs && onMediaPrefsChange ? (
                    <VideoEffects
                      prefs={prefs}
                      supported={effectsSupported}
                      accountBound={accountBound}
                      uploading={uploading}
                      fileRef={fileRef}
                      onChange={onMediaPrefsChange}
                      onUpload={(file) => void handleUpload(file)}
                      t={t}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm text-ink-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
      />
      <span>
        <span className="block text-ink">{label}</span>
        {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

function VideoEffects({
  prefs,
  supported,
  accountBound,
  uploading,
  fileRef,
  onChange,
  onUpload,
  t,
}: {
  prefs: MediaPrefs;
  supported: boolean;
  accountBound: boolean;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<MediaPrefs>) => void;
  onUpload: (file: File | undefined) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!supported) return <p className="text-xs text-ink-faint">{t("effectsUnsupported")}</p>;
  return (
    <section className="space-y-3 border-t border-line pt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {t("effectsTitle")}
      </h3>
      <div className="flex flex-wrap gap-2">
        {(["none", "blur", "virtual"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() =>
              onChange({
                videoEffect: mode,
                ...(mode === "virtual" && !prefs.virtualBackgroundUrl
                  ? { virtualBackgroundUrl: VIRTUAL_BACKGROUND_PRESETS[0].url }
                  : {}),
              })
            }
            className={cn(
              "rounded-xl border px-3 py-2 text-sm",
              prefs.videoEffect === mode
                ? "border-brand-primary/60 bg-white/10 text-ink"
                : "border-line text-ink-muted",
            )}
          >
            {t(
              mode === "none"
                ? "effectsNone"
                : mode === "blur"
                  ? "effectsBlur"
                  : "effectsVirtual",
            )}
          </button>
        ))}
      </div>
      {prefs.videoEffect === "blur" ? (
        <input
          aria-label={t("effectsBlurRadius")}
          type="range"
          min={4}
          max={24}
          value={prefs.blurRadius}
          onChange={(e) => onChange({ blurRadius: Number(e.target.value) })}
          className="w-full accent-[var(--brand-primary)]"
        />
      ) : null}
      {prefs.videoEffect === "virtual" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {VIRTUAL_BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChange({
                    videoEffect: "virtual",
                    virtualBackgroundUrl: preset.url,
                  })
                }
                className={cn(
                  "aspect-video overflow-hidden rounded-xl border",
                  prefs.virtualBackgroundUrl === preset.url
                    ? "border-brand-primary ring-2 ring-brand-primary/40"
                    : "border-line",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preset.url}
                  alt={t(preset.labelKey)}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
          {accountBound ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink-muted disabled:opacity-50"
              >
                {uploading ? t("effectsUploading") : t("effectsUpload")}
              </button>
            </>
          ) : (
            <p className="text-xs text-ink-faint">{t("effectsUploadLogin")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
