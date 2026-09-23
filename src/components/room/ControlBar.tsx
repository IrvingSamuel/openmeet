"use client";

import {
  useRoomContext,
  useTrackToggle,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { unlockMeetingChimes } from "@/lib/recording-beep";
import { useIsSmUp } from "@/hooks/useMediaQuery";
import { useMeetingDevices } from "@/hooks/useMeetingDevices";
import { useToast } from "@/components/ui/Toast";
import { springSoft } from "@/components/motion/primitives";
import {
  IconCaptions,
  IconChat,
  IconGrid,
  IconHand,
  IconMic,
  IconMicOff,
  IconMore,
  IconPhoneOff,
  IconReaction,
  IconScreen,
  IconSettings,
  IconSparkles,
  IconSpotlight,
  IconUsers,
  IconVideo,
  IconVideoOff,
  IconRecord,
} from "@/components/ui/icons";
import type { StageLayout } from "@/components/room/Stage";
import { FloatingMenu } from "@/components/room/FloatingMenu";
import { ReactionPicker } from "@/components/room/ReactionPicker";
import {
  CameraDeviceMenu,
  MicDeviceMenu,
  SplitDeviceControl,
  useExclusiveMenus,
} from "@/components/room/DeviceMenus";
import { DeviceSettingsModal } from "@/components/room/DeviceSettingsModal";
import { canUseBackgroundEffects } from "@/hooks/useMeetingEffects";
import type { MediaPrefs } from "@/lib/media-prefs-schema";
import { screenShareCaptureOptions } from "@/lib/screen-share";

export type SidePanel = "none" | "chat" | "people" | "captions" | "copilot";

export function ControlBar({
  layout,
  onLayoutChange,
  panel,
  onPanelChange,
  captionsOn,
  onCaptionsToggle,
  unreadChat,
  peopleCount,
  pendingJoinRequests = 0,
  insightCount,
  isHost,
  recordingActive,
  recordingBusy,
  canToggleRecording,
  highlightRecording,
  recordingHint,
  onToggleRecording,
  onLeave,
  onEndForAll,
  handRaised = false,
  onToggleHand,
  onSendReaction,
  mediaPrefs,
  mediaPrefsReady = false,
  mediaPrefsAccountBound = false,
  mediaPrefsSaving = false,
  resolvedCaptionsDefault = true,
  onMediaPrefsChange,
  onUploadVirtualBackground,
  showPeopleInBar = true,
}: {
  layout: StageLayout;
  onLayoutChange: (layout: StageLayout) => void;
  panel: SidePanel;
  onPanelChange: (panel: SidePanel) => void;
  captionsOn: boolean;
  onCaptionsToggle: () => void;
  unreadChat: number;
  peopleCount: number;
  pendingJoinRequests?: number;
  insightCount?: number;
  isHost?: boolean;
  recordingActive?: boolean;
  recordingBusy?: boolean;
  canToggleRecording?: boolean;
  highlightRecording?: boolean;
  recordingHint?: string;
  onToggleRecording?: () => void;
  onLeave: () => void;
  onEndForAll?: () => void | Promise<void>;
  handRaised?: boolean;
  onToggleHand?: () => void | Promise<void>;
  onSendReaction?: (emoji: string) => void | Promise<boolean>;
  mediaPrefs?: MediaPrefs;
  mediaPrefsReady?: boolean;
  mediaPrefsAccountBound?: boolean;
  mediaPrefsSaving?: boolean;
  resolvedCaptionsDefault?: boolean;
  onMediaPrefsChange?: (patch: Partial<MediaPrefs>) => void;
  onUploadVirtualBackground?: (file: File) => Promise<string>;
  /** When false, people control lives in the room header (next to copy link). */
  showPeopleInBar?: boolean;
}) {
  const t = useTranslations("room.controlBar");
  const tRoom = useTranslations("room");
  const room = useRoomContext();
  const toast = useToast();
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const devicesApi = useMeetingDevices(room);
  const deviceMenus = useExclusiveMenus();
  const [leaveMenuOpen, setLeaveMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const compact = !useIsSmUp();
  const moreAnchorRef = useRef<HTMLButtonElement>(null);
  const reactionsAnchorRef = useRef<HTMLButtonElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const recordBtnRef = useRef<HTMLButtonElement>(null);
  const chimesUnlockedRef = useRef(false);

  function unlockChimesOnce() {
    if (chimesUnlockedRef.current) return;
    chimesUnlockedRef.current = true;
    unlockMeetingChimes();
  }

  function pickReaction(emoji: string) {
    void onSendReaction?.(emoji);
    setReactionsOpen(false);
  }

  function selectPanel(next: SidePanel) {
    onPanelChange(panel === next ? "none" : next);
    setMoreOpen(false);
  }

  function openOptions() {
    deviceMenus.closeAll();
    setMoreOpen(false);
    setReactionsOpen(false);
    setShareMenuOpen(false);
    setOptionsOpen(true);
  }

  async function startScreenShare(withAudio: boolean) {
    setShareMenuOpen(false);
    try {
      await screen.toggle(true, screenShareCaptureOptions(withAudio));
    } catch (err) {
      if (!withAudio) {
        const label = err instanceof Error ? err.message : String(err);
        toast.error(tRoom("mediaDeviceError", { label }));
        return;
      }
      // Browser may reject display-audio; fall back to video-only share.
      try {
        await screen.toggle(true, screenShareCaptureOptions(false));
        toast.push(t("shareAudioFallback"), "info");
      } catch (fallbackErr) {
        const label =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        toast.error(tRoom("mediaDeviceError", { label }));
      }
    }
  }

  function onScreenShareClick() {
    if (screen.enabled) {
      setShareMenuOpen(false);
      void screen.toggle(false);
      return;
    }
    setReactionsOpen(false);
    setMoreOpen(false);
    setShareMenuOpen((v) => !v);
  }

  async function switchSafe(
    kind: "mic" | "camera" | "speaker",
    deviceId: string,
  ) {
    try {
      if (kind === "mic") await devicesApi.switchMic(deviceId);
      else if (kind === "camera") await devicesApi.switchCamera(deviceId);
      else await devicesApi.switchSpeaker(deviceId);
      deviceMenus.closeAll();
    } catch (err) {
      const label = err instanceof Error ? err.message : String(err);
      toast.error(tRoom("mediaDeviceError", { label }));
    }
  }

  const moreBadge = showPeopleInBar
    ? (pendingJoinRequests > 0 ? 1 : 0) + (peopleCount > 1 ? 1 : 0)
    : 0;

  const peopleBadge =
    pendingJoinRequests > 0
      ? String(pendingJoinRequests)
      : peopleCount > 1
        ? String(peopleCount)
        : undefined;
  const peopleBadgeTone =
    pendingJoinRequests > 0 ? "danger" : "brand";

  return (
    <div
      className="relative flex max-w-[calc(100vw-1.5rem)] items-end gap-1.5"
      onPointerDown={unlockChimesOnce}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...springSoft, delay: 0.15 }}
        className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl glass-strong p-1.5 shadow-lift"
      >
        <SplitDeviceControl
          active={mic.enabled}
          danger={!mic.enabled}
          pending={mic.pending}
          onToggle={() => {
            void mic.toggle();
          }}
          toggleLabel={mic.enabled ? t("muteMic") : t("unmuteMic")}
          menuLabel={t("selectMic")}
          menuOpen={deviceMenus.micOpen}
          onMenuOpenChange={(open) => {
            if (open) void devicesApi.refresh();
            deviceMenus.setMicOpen(open);
          }}
          menu={
            <MicDeviceMenu
              mics={devicesApi.devices.mics}
              speakers={devicesApi.devices.speakers}
              activeMicId={devicesApi.active.micId}
              activeSpeakerId={devicesApi.active.speakerId}
              speakerSupported={devicesApi.speakerSupported}
              switching={devicesApi.switching}
              onSelectMic={(id) => {
                void switchSafe("mic", id);
              }}
              onSelectSpeaker={(id) => {
                void switchSafe("speaker", id);
              }}
              onOpenOptions={openOptions}
            />
          }
        >
          {mic.enabled ? <IconMic /> : <IconMicOff />}
        </SplitDeviceControl>

        <SplitDeviceControl
          active={cam.enabled}
          danger={!cam.enabled}
          pending={cam.pending}
          onToggle={() => {
            void cam.toggle();
          }}
          toggleLabel={cam.enabled ? t("turnOffCam") : t("turnOnCam")}
          menuLabel={t("selectCam")}
          menuOpen={deviceMenus.camOpen}
          onMenuOpenChange={(open) => {
            if (open) void devicesApi.refresh();
            deviceMenus.setCamOpen(open);
          }}
          menu={
            <CameraDeviceMenu
              cameras={devicesApi.devices.cameras}
              activeCameraId={devicesApi.active.cameraId}
              switching={devicesApi.switching}
              onSelectCamera={(id) => {
                void switchSafe("camera", id);
              }}
              onOpenOptions={openOptions}
            />
          }
        >
          {cam.enabled ? <IconVideo /> : <IconVideoOff />}
        </SplitDeviceControl>

        <ControlButton
          active={handRaised}
          onClick={() => {
            void onToggleHand?.();
          }}
          label={handRaised ? t("lowerHand") : t("raiseHand")}
        >
          <IconHand />
        </ControlButton>

        {canToggleRecording ? (
          <div className="relative shrink-0">
            <ControlButton
              ref={recordBtnRef}
              active={Boolean(recordingActive) || highlightRecording}
              danger={Boolean(recordingActive)}
              pending={Boolean(recordingBusy)}
              onClick={() => onToggleRecording?.()}
              label={recordingActive ? t("stopRecording") : t("startRecording")}
              className={
                highlightRecording && !recordingActive
                  ? "ring-2 ring-brand-primary ring-offset-2 ring-offset-[var(--brand-bg)]"
                  : undefined
              }
            >
              <IconRecord />
            </ControlButton>
            <RecordingHintTooltip
              anchorRef={recordBtnRef}
              open={Boolean(highlightRecording && recordingHint)}
              text={recordingHint ?? ""}
            />
          </div>
        ) : null}

        <Separator />

        <ControlButton
          active={captionsOn}
          onClick={onCaptionsToggle}
          label={captionsOn ? t("hideCaptions") : t("showCaptions")}
        >
          <IconCaptions />
        </ControlButton>

        <ControlButton
          ref={reactionsAnchorRef}
          active={reactionsOpen}
          onClick={() => setReactionsOpen((v) => !v)}
          label={t("reactions")}
        >
          <IconReaction />
        </ControlButton>

        <ControlButton
          ref={shareBtnRef}
          active={screen.enabled || shareMenuOpen}
          onClick={onScreenShareClick}
          label={screen.enabled ? t("stopShare") : t("startShare")}
          aria-expanded={!screen.enabled ? shareMenuOpen : undefined}
          aria-haspopup={!screen.enabled ? "menu" : undefined}
        >
          <IconScreen />
        </ControlButton>

        <FloatingMenu
          open={shareMenuOpen && !screen.enabled}
          onClose={() => setShareMenuOpen(false)}
          anchorRef={shareBtnRef}
          align="center"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void startScreenShare(false)}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-white/[0.06]"
          >
            {t("startShare")}
            <span className="mt-0.5 block text-[11px] text-ink-faint">
              {t("startShareHint")}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void startScreenShare(true)}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-white/[0.06]"
          >
            {t("startShareAudio")}
            <span className="mt-0.5 block text-[11px] text-ink-faint">
              {t("startShareAudioHint")}
            </span>
          </button>
        </FloatingMenu>

        <ControlButton
          active={panel === "copilot"}
          onClick={() => selectPanel("copilot")}
          label={t("copilot")}
          badge={
            insightCount && insightCount > 0
              ? String(insightCount)
              : undefined
          }
        >
          <IconSparkles />
        </ControlButton>

        <ControlButton
          active={panel === "chat"}
          onClick={() => selectPanel("chat")}
          label={t("chat")}
          badge={unreadChat > 0 ? String(unreadChat) : undefined}
          badgeTone="danger"
        >
          <IconChat />
        </ControlButton>

        <ControlButton
          ref={moreAnchorRef}
          active={moreOpen || panel === "people" || optionsOpen}
          onClick={() => setMoreOpen((v) => !v)}
          label={t("moreControls")}
          badge={moreBadge > 0 ? String(moreBadge) : undefined}
        >
          <IconMore />
        </ControlButton>
        <FloatingMenu
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          anchorRef={moreAnchorRef}
          align="center"
        >
          <MoreItem
            label={layout === "grid" ? t("spotlightMode") : t("gridMode")}
            active={layout === "spotlight"}
            onClick={() => {
              onLayoutChange(layout === "grid" ? "spotlight" : "grid");
              setMoreOpen(false);
            }}
          >
            {layout === "grid" ? <IconGrid /> : <IconSpotlight />}
          </MoreItem>
          <MoreItem
            label={t("fullTranscript")}
            active={panel === "captions"}
            onClick={() => selectPanel("captions")}
          >
            <TranscriptIcon />
          </MoreItem>
          <MoreItem
            label={t("options")}
            active={optionsOpen}
            onClick={() => {
              openOptions();
            }}
          >
            <IconSettings />
          </MoreItem>
          {compact ? (
            <MoreItem
              label={handRaised ? t("lowerHand") : t("raiseHand")}
              active={handRaised}
              onClick={() => {
                void onToggleHand?.();
                setMoreOpen(false);
              }}
            >
              <IconHand />
            </MoreItem>
          ) : null}
          {showPeopleInBar ? (
            <MoreItem
              label={t("people")}
              active={panel === "people"}
              badge={peopleBadge}
              badgeTone={peopleBadgeTone}
              onClick={() => selectPanel("people")}
            >
              <IconUsers />
            </MoreItem>
          ) : null}
        </FloatingMenu>
      </motion.div>

      <FloatingMenu
        open={reactionsOpen}
        onClose={() => setReactionsOpen(false)}
        anchorRef={reactionsAnchorRef}
        align="center"
      >
        <ReactionPicker onPick={pickReaction} />
      </FloatingMenu>

      <DeviceSettingsModal
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        mediaPrefs={mediaPrefs}
        mediaPrefsReady={mediaPrefsReady}
        accountBound={mediaPrefsAccountBound}
        saving={mediaPrefsSaving}
        resolvedCaptionsDefault={resolvedCaptionsDefault}
        effectsSupported={canUseBackgroundEffects()}
        onMediaPrefsChange={onMediaPrefsChange}
        onUploadVirtualBackground={onUploadVirtualBackground}
      />

      {/* Leave sits outside overflow-x-auto so its menu isn't clipped under video */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...springSoft, delay: 0.15 }}
        className="pointer-events-auto relative shrink-0 rounded-2xl glass-strong p-1.5 shadow-lift"
      >
        <LeaveControl
          isHost={isHost}
          open={leaveMenuOpen}
          onOpenChange={setLeaveMenuOpen}
          onLeave={onLeave}
          onEndForAll={onEndForAll}
        />
      </motion.div>
    </div>
  );
}

function TranscriptIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={18}
      height={18}
      aria-hidden
    >
      <path d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  );
}

function MoreItem({
  children,
  label,
  onClick,
  active,
  badge,
  badgeTone = "brand",
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: string;
  badgeTone?: "brand" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-[color-mix(in_srgb,var(--brand-primary)_22%,transparent)] text-ink"
          : "text-ink-muted hover:bg-white/[0.06] hover:text-ink",
      )}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white/[0.04]">
        {children}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span
          className={cn(
            "grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold text-white",
            badgeTone === "danger" ? "bg-rose-500" : "bg-brand-primary",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function LeaveControl({
  isHost,
  open,
  onOpenChange,
  onLeave,
  onEndForAll,
}: {
  isHost?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeave: () => void;
  onEndForAll?: () => void | Promise<void>;
}) {
  const t = useTranslations("room.controlBar");
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <motion.button
        ref={buttonRef}
        onClick={() => {
          if (isHost && onEndForAll) {
            onOpenChange(!open);
            return;
          }
          onLeave();
        }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.95 }}
        transition={springSoft}
        aria-label={t("leaveMeeting")}
        aria-expanded={isHost ? open : undefined}
        className="grid h-12 w-14 place-items-center rounded-xl bg-rose-500 text-white shadow-[0_10px_36px_-12px_rgba(244,63,94,0.9)] transition-colors hover:bg-rose-400"
      >
        <IconPhoneOff />
      </motion.button>
      <FloatingMenu
        open={Boolean(open && isHost)}
        onClose={() => onOpenChange(false)}
        anchorRef={buttonRef}
        align="right"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenChange(false);
            onLeave();
          }}
          className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-white/[0.06]"
        >
          {t("leaveMeeting")}
          <span className="mt-0.5 block text-[11px] text-ink-faint">
            {t("leaveHint")}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenChange(false);
            onEndForAll?.();
          }}
          className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-rose-200 transition-colors hover:bg-rose-500/15"
        >
          {t("endForAll")}
          <span className="mt-0.5 block text-[11px] text-rose-200/70">
            {t("endForAllHint")}
          </span>
        </button>
      </FloatingMenu>
    </>
  );
}

function Separator() {
  return <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line" />;
}

function RecordingHintTooltip({
  anchorRef,
  open,
  text,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  text: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorRef.current || !text) {
      setPos(null);
      return;
    }
    const update = () => {
      const node = anchorRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, text, anchorRef]);

  if (!open || !pos || !text || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full"
      style={{ left: pos.x, top: pos.y - 10 }}
    >
      <div className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-lift">
        {text}
      </div>
      <span
        aria-hidden
        className="mx-auto block h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-white"
      />
    </div>,
    document.body,
  );
}

const ControlButton = forwardRef(function ControlButton(
  {
    children,
    onClick,
    label,
    active,
    danger,
    pending,
    badge,
    badgeTone = "brand",
    className,
    "aria-expanded": ariaExpanded,
    "aria-haspopup": ariaHaspopup,
  }: {
    children: ReactNode;
    onClick: () => void;
    label: string;
    active?: boolean;
    danger?: boolean;
    pending?: boolean;
    badge?: string;
    badgeTone?: "brand" | "danger";
    className?: string;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: boolean | "menu" | "listbox" | "tree" | "grid" | "dialog";
  },
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      disabled={pending}
      aria-label={label}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      title={label}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={springSoft}
      className={cn(
        "relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-colors duration-300 disabled:opacity-50",
        danger
          ? "border-rose-400/50 bg-rose-500/85 text-white"
          : active
            ? "border-brand-primary/60 bg-[color-mix(in_srgb,var(--brand-primary)_28%,transparent)] text-white"
            : "border-line bg-white/[0.05] text-ink-muted hover:text-ink",
        className,
      )}
    >
      {children}
      {badge ? (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={springSoft}
          className={cn(
            "absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold text-white",
            badgeTone === "danger" ? "bg-rose-500" : "bg-brand-primary",
          )}
        >
          {badge}
        </motion.span>
      ) : null}
    </motion.button>
  );
});
ControlButton.displayName = "ControlButton";
