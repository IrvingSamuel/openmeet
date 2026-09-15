"use client";

import { useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EASE_OUT_EXPO, springSoft } from "@/components/motion/primitives";
import { Select } from "@/components/ui/Field";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useMeetingDevices } from "@/hooks/useMeetingDevices";
import { deviceLabel } from "@/components/room/DeviceMenus";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
  VIRTUAL_BACKGROUND_PRESETS,
  type MediaPrefs,
} from "@/lib/media-prefs-schema";

export function DeviceSettingsModal({
  open,
  onClose,
  mediaPrefs,
  mediaPrefsReady = false,
  accountBound = false,
  saving = false,
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
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prefs = mediaPrefs;

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const camPub = room.localParticipant.getTrackPublication(
    Track.Source.Camera,
  );
  const micPub = room.localParticipant.getTrackPublication(
    Track.Source.Microphone,
  );
  const camTrack = camPub?.track;
  const micTrack = micPub?.track;
  const videoStream = useMemo(() => {
    const mst = camTrack?.mediaStreamTrack;
    if (!mst || camTrack?.isMuted) return null;
    return new MediaStream([mst]);
  }, [camTrack, camTrack?.isMuted, camTrack?.mediaStreamTrack]);

  const audioStream = useMemo(() => {
    const mst = micTrack?.mediaStreamTrack;
    if (!mst || micTrack?.isMuted) return null;
    return new MediaStream([mst]);
  }, [micTrack, micTrack?.isMuted, micTrack?.mediaStreamTrack]);

  const level = useAudioLevel(audioStream, open && Boolean(audioStream));

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoStream;
    if (videoStream) {
      void el.play().catch(() => undefined);
    }
    return () => {
      el.srcObject = null;
    };
  }, [videoStream]);

  async function handleSwitch(
    kind: "camera" | "mic" | "speaker",
    deviceId: string,
  ) {
    try {
      if (kind === "camera") await switchCamera(deviceId);
      else if (kind === "mic") await switchMic(deviceId);
      else await switchSpeaker(deviceId);
    } catch (err) {
      const label = err instanceof Error ? err.message : String(err);
      toast.error(tRoom("mediaDeviceError", { label }));
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
      const label = err instanceof Error ? err.message : String(err);
      toast.error(t("effectsUploadFailed", { label }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
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
            className="relative z-10 w-full max-w-lg max-h-[min(90dvh,720px)] overflow-y-auto overflow-x-hidden rounded-3xl glass-strong shadow-lift"
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-secondary to-transparent"
            />
            <header className="space-y-1 px-6 pb-4 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-ink">
                    {t("options")}
                  </h2>
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
                  className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">
                {t("optionsDescription")}
              </p>
            </header>

            <div className="space-y-5 px-6 pb-6">
              <div className="overflow-hidden rounded-2xl border border-line bg-black/40">
                <div className="relative aspect-video bg-black/60">
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
                <div className="flex items-center gap-3 border-t border-line px-4 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    {t("microphone")}
                  </span>
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                    role="meter"
                    aria-label={t("micLevel")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(level * 100)}
                  >
                    <motion.div
                      className="h-full rounded-full bg-brand-primary"
                      animate={{ width: `${Math.max(2, level * 100)}%` }}
                      transition={springSoft}
                    />
                  </div>
                </div>
              </div>

              <Select
                label={t("camera")}
                value={active.cameraId}
                disabled={switching || devices.cameras.length === 0}
                onChange={(e) => {
                  void handleSwitch("camera", e.target.value);
                }}
              >
                {devices.cameras.length === 0 ? (
                  <option value="">{t("noDevices")}</option>
                ) : (
                  devices.cameras.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {deviceLabel(d, i, (n) => t("cameraN", { n }))}
                    </option>
                  ))
                )}
              </Select>

              <Select
                label={t("microphone")}
                value={active.micId}
                disabled={switching || devices.mics.length === 0}
                onChange={(e) => {
                  void handleSwitch("mic", e.target.value);
                }}
              >
                {devices.mics.length === 0 ? (
                  <option value="">{t("noDevices")}</option>
                ) : (
                  devices.mics.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {deviceLabel(d, i, (n) => t("micN", { n }))}
                    </option>
                  ))
                )}
              </Select>

              {speakerSupported ? (
                <Select
                  label={t("speaker")}
                  value={active.speakerId}
                  disabled={switching || devices.speakers.length === 0}
                  onChange={(e) => {
                    void handleSwitch("speaker", e.target.value);
                  }}
                >
                  {devices.speakers.length === 0 ? (
                    <option value="">{t("noDevices")}</option>
                  ) : (
                    devices.speakers.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {deviceLabel(d, i, (n) => t("speakerN", { n }))}
                      </option>
                    ))
                  )}
                </Select>
              ) : (
                <p className={cn("text-xs text-ink-faint")}>
                  {t("speakerUnsupported")}
                </p>
              )}

              {prefs && onMediaPrefsChange ? (
                <section className="space-y-3 border-t border-line pt-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    {t("effectsTitle")}
                  </h3>

                  {!effectsSupported ? (
                    <p className="text-xs text-ink-faint">
                      {t("effectsUnsupported")}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ["none", t("effectsNone")],
                            ["blur", t("effectsBlur")],
                            ["virtual", t("effectsVirtual")],
                          ] as const
                        ).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              const patch: Partial<MediaPrefs> = {
                                videoEffect: mode,
                              };
                              if (
                                mode === "virtual" &&
                                !prefs.virtualBackgroundUrl
                              ) {
                                patch.virtualBackgroundUrl =
                                  VIRTUAL_BACKGROUND_PRESETS[0].url;
                              }
                              onMediaPrefsChange(patch);
                            }}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm transition-colors",
                              prefs.videoEffect === mode
                                ? "border-brand-primary/60 bg-[color-mix(in_srgb,var(--brand-primary)_28%,transparent)] text-ink"
                                : "border-line text-ink-muted hover:bg-white/[0.06] hover:text-ink",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {prefs.videoEffect === "blur" ? (
                        <label className="block space-y-2">
                          <span className="text-xs text-ink-muted">
                            {t("effectsBlurRadius")}: {prefs.blurRadius}
                          </span>
                          <input
                            type="range"
                            min={4}
                            max={24}
                            value={prefs.blurRadius}
                            onChange={(e) =>
                              onMediaPrefsChange({
                                blurRadius: Number(e.target.value),
                              })
                            }
                            className="w-full accent-[var(--brand-primary)]"
                          />
                        </label>
                      ) : null}

                      {prefs.videoEffect === "virtual" ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            {VIRTUAL_BACKGROUND_PRESETS.map((preset) => {
                              const selected =
                                prefs.virtualBackgroundUrl === preset.url;
                              const presetLabels: Record<string, string> = {
                                presetOffice: t("presetOffice"),
                                presetLiving: t("presetLiving"),
                                presetBookshelf: t("presetBookshelf"),
                                presetGradient: t("presetGradient"),
                                presetNature: t("presetNature"),
                                presetAbstract: t("presetAbstract"),
                              };
                              const label =
                                presetLabels[preset.labelKey] ?? preset.id;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  title={label}
                                  onClick={() =>
                                    onMediaPrefsChange({
                                      videoEffect: "virtual",
                                      virtualBackgroundUrl: preset.url,
                                    })
                                  }
                                  className={cn(
                                    "relative aspect-video overflow-hidden rounded-xl border transition-colors",
                                    selected
                                      ? "border-brand-primary ring-2 ring-brand-primary/40"
                                      : "border-line hover:border-line-strong",
                                  )}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={preset.url}
                                    alt={label}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              );
                            })}
                          </div>

                          {prefs.virtualBackgroundUrl &&
                          !VIRTUAL_BACKGROUND_PRESETS.some(
                            (p) => p.url === prefs.virtualBackgroundUrl,
                          ) ? (
                            <div className="overflow-hidden rounded-xl border border-brand-primary/50">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={prefs.virtualBackgroundUrl}
                                alt={t("effectsCustomBg")}
                                className="aspect-video w-full object-cover"
                              />
                            </div>
                          ) : null}

                          {accountBound && onUploadVirtualBackground ? (
                            <>
                              <input
                                ref={fileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  void handleUpload(e.target.files?.[0]);
                                }}
                              />
                              <button
                                type="button"
                                disabled={uploading}
                                onClick={() => fileRef.current?.click()}
                                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                              >
                                {uploading
                                  ? t("effectsUploading")
                                  : t("effectsUpload")}
                              </button>
                            </>
                          ) : (
                            <p className="text-xs text-ink-faint">
                              {t("effectsUploadLogin")}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}

                  <div className="space-y-2 border-t border-line pt-4">
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      {t("effectsAudioTitle")}
                    </h4>
                    {(
                      [
                        ["noiseSuppression", t("effectsNoise")],
                        ["echoCancellation", t("effectsEcho")],
                        ["autoGainControl", t("effectsAgc")],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5 text-sm text-ink-muted hover:text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={prefs[key]}
                          onChange={(e) =>
                            onMediaPrefsChange({ [key]: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-line accent-[var(--brand-primary)]"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
