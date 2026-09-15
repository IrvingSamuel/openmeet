"use client";

import { useTranslations } from "next-intl";
import {
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import { FloatingMenu } from "@/components/room/FloatingMenu";
import {
  IconCheck,
  IconChevronDown,
  IconCaptions,
  IconMic,
  IconSettings,
  IconSpeaker,
  IconVideo,
} from "@/components/ui/icons";

export function DeviceMenuItem({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
        selected
          ? "bg-[color-mix(in_srgb,var(--brand-primary)_22%,transparent)] text-ink"
          : "text-ink-muted hover:bg-white/[0.06] hover:text-ink",
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">
        {selected ? <IconCheck className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function DeviceMenuSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {icon ? <span className="opacity-80">{icon}</span> : null}
        {title}
      </div>
      {children}
    </div>
  );
}

export function deviceLabel(
  device: MediaDeviceInfo,
  index: number,
  fallback: (n: number) => string,
): string {
  const label = device.label?.trim();
  if (label) return label;
  return fallback(index + 1);
}

export function SplitCaptionsControl({
  captionsOn,
  transcriptOpen,
  onToggleCaptions,
  onToggleTranscript,
  toggleLabel,
  transcriptLabel,
}: {
  captionsOn: boolean;
  transcriptOpen: boolean;
  onToggleCaptions: () => void;
  onToggleTranscript: () => void;
  toggleLabel: string;
  transcriptLabel: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-12 shrink-0 overflow-hidden rounded-xl border transition-colors duration-300",
        captionsOn || transcriptOpen
          ? "border-brand-primary/60 bg-[color-mix(in_srgb,var(--brand-primary)_28%,transparent)] text-white"
          : "border-line bg-white/[0.05] text-ink-muted",
      )}
    >
      <button
        type="button"
        aria-label={toggleLabel}
        aria-pressed={captionsOn}
        title={toggleLabel}
        onClick={onToggleCaptions}
        className={cn(
          "grid h-12 w-11 place-items-center transition-colors",
          !captionsOn && !transcriptOpen && "hover:text-ink",
        )}
      >
        <IconCaptions />
      </button>
      <button
        type="button"
        aria-label={transcriptLabel}
        aria-pressed={transcriptOpen}
        title={transcriptLabel}
        onClick={onToggleTranscript}
        className={cn(
          "grid h-12 w-7 place-items-center border-l transition-colors",
          captionsOn || transcriptOpen
            ? "border-white/20 hover:bg-white/10"
            : "border-line hover:bg-white/[0.06] hover:text-ink",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          width={14}
          height={14}
          aria-hidden
        >
          <path d="M4 6h16M4 12h10M4 18h14" />
        </svg>
      </button>
    </div>
  );
}

export function SplitDeviceControl({
  children,
  toggleLabel,
  menuLabel,
  active,
  danger,
  pending,
  onToggle,
  menuOpen,
  onMenuOpenChange,
  menu,
}: {
  children: ReactNode;
  toggleLabel: string;
  menuLabel: string;
  active?: boolean;
  danger?: boolean;
  pending?: boolean;
  onToggle: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  menu: ReactNode;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      ref={anchorRef}
      className={cn(
        "relative flex h-12 shrink-0 overflow-hidden rounded-xl border transition-colors duration-300",
        danger
          ? "border-rose-400/50 bg-rose-500/85 text-white"
          : active
            ? "border-brand-primary/60 bg-[color-mix(in_srgb,var(--brand-primary)_28%,transparent)] text-white"
            : "border-line bg-white/[0.05] text-ink-muted",
      )}
    >
      <button
        type="button"
        disabled={pending}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={onToggle}
        className={cn(
          "grid h-12 w-11 place-items-center transition-colors disabled:opacity-50",
          !danger && !active && "hover:text-ink",
        )}
      >
        {children}
      </button>
      <button
        ref={chevronRef}
        type="button"
        aria-label={menuLabel}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title={menuLabel}
        onClick={() => onMenuOpenChange(!menuOpen)}
        className={cn(
          "grid h-12 w-7 place-items-center border-l transition-colors",
          danger
            ? "border-white/25 hover:bg-white/10"
            : active
              ? "border-white/20 hover:bg-white/10"
              : "border-line hover:bg-white/[0.06] hover:text-ink",
        )}
      >
        <IconChevronDown className="h-3.5 w-3.5" />
      </button>
      <FloatingMenu
        open={menuOpen}
        onClose={() => onMenuOpenChange(false)}
        anchorRef={anchorRef as RefObject<HTMLElement | null>}
        align="left"
        className="w-72"
      >
        {menu}
      </FloatingMenu>
    </div>
  );
}

export function MicDeviceMenu({
  mics,
  speakers,
  activeMicId,
  activeSpeakerId,
  speakerSupported,
  switching,
  onSelectMic,
  onSelectSpeaker,
  onOpenOptions,
}: {
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  activeMicId: string;
  activeSpeakerId: string;
  speakerSupported: boolean;
  switching?: boolean;
  onSelectMic: (deviceId: string) => void;
  onSelectSpeaker: (deviceId: string) => void;
  onOpenOptions: () => void;
}) {
  const t = useTranslations("room.controlBar");

  return (
    <>
      <DeviceMenuSection
        title={t("microphone")}
        icon={<IconMic className="h-3 w-3" />}
      >
        {mics.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-faint">{t("noDevices")}</p>
        ) : (
          mics.map((d, i) => (
            <DeviceMenuItem
              key={d.deviceId || `mic-${i}`}
              label={deviceLabel(d, i, (n) => t("micN", { n }))}
              selected={
                d.deviceId === activeMicId ||
                (!activeMicId && i === 0)
              }
              disabled={switching}
              onClick={() => onSelectMic(d.deviceId)}
            />
          ))
        )}
      </DeviceMenuSection>

      {speakerSupported ? (
        <>
          <div className="mx-2 border-t border-line" />
          <DeviceMenuSection
            title={t("speaker")}
            icon={<IconSpeaker className="h-3 w-3" />}
          >
            {speakers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-faint">
                {t("noDevices")}
              </p>
            ) : (
              speakers.map((d, i) => (
                <DeviceMenuItem
                  key={d.deviceId || `spk-${i}`}
                  label={deviceLabel(d, i, (n) => t("speakerN", { n }))}
                  selected={
                    d.deviceId === activeSpeakerId ||
                    (!activeSpeakerId && i === 0)
                  }
                  disabled={switching}
                  onClick={() => onSelectSpeaker(d.deviceId)}
                />
              ))
            )}
          </DeviceMenuSection>
        </>
      ) : null}

      <div className="mx-2 border-t border-line" />
      <button
        type="button"
        role="menuitem"
        onClick={onOpenOptions}
        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <IconSettings className="h-4 w-4 shrink-0" />
        <span>{t("optionsEllipsis")}</span>
      </button>
    </>
  );
}

export function CameraDeviceMenu({
  cameras,
  activeCameraId,
  switching,
  onSelectCamera,
  onOpenOptions,
}: {
  cameras: MediaDeviceInfo[];
  activeCameraId: string;
  switching?: boolean;
  onSelectCamera: (deviceId: string) => void;
  onOpenOptions: () => void;
}) {
  const t = useTranslations("room.controlBar");

  return (
    <>
      <DeviceMenuSection
        title={t("camera")}
        icon={<IconVideo className="h-3 w-3" />}
      >
        {cameras.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-faint">{t("noDevices")}</p>
        ) : (
          cameras.map((d, i) => (
            <DeviceMenuItem
              key={d.deviceId || `cam-${i}`}
              label={deviceLabel(d, i, (n) => t("cameraN", { n }))}
              selected={
                d.deviceId === activeCameraId ||
                (!activeCameraId && i === 0)
              }
              disabled={switching}
              onClick={() => onSelectCamera(d.deviceId)}
            />
          ))
        )}
      </DeviceMenuSection>
      <div className="mx-2 border-t border-line" />
      <button
        type="button"
        role="menuitem"
        onClick={onOpenOptions}
        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <IconSettings className="h-4 w-4 shrink-0" />
        <span>{t("optionsEllipsis")}</span>
      </button>
    </>
  );
}

/** Local state helper for mutually exclusive floating menus. */
export function useExclusiveMenus() {
  const [open, setOpen] = useState<"mic" | "cam" | null>(null);
  return {
    micOpen: open === "mic",
    camOpen: open === "cam",
    setMicOpen: (v: boolean) => setOpen(v ? "mic" : null),
    setCamOpen: (v: boolean) => setOpen(v ? "cam" : null),
    closeAll: () => setOpen(null),
  };
}
