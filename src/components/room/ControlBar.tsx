"use client";

import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsSmUp } from "@/hooks/useMediaQuery";
import { springSoft } from "@/components/motion/primitives";
import {
  IconCaptions,
  IconChat,
  IconGrid,
  IconMic,
  IconMicOff,
  IconMore,
  IconPhoneOff,
  IconScreen,
  IconSparkles,
  IconSpotlight,
  IconUsers,
  IconVideo,
  IconVideoOff,
} from "@/components/ui/icons";
import type { StageLayout } from "@/components/room/Stage";
import { FloatingMenu } from "@/components/room/FloatingMenu";

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
  insightCount,
  isHost,
  onLeave,
  onEndForAll,
}: {
  layout: StageLayout;
  onLayoutChange: (layout: StageLayout) => void;
  panel: SidePanel;
  onPanelChange: (panel: SidePanel) => void;
  captionsOn: boolean;
  onCaptionsToggle: () => void;
  unreadChat: number;
  peopleCount: number;
  insightCount?: number;
  isHost?: boolean;
  onLeave: () => void;
  onEndForAll?: () => void | Promise<void>;
}) {
  const t = useTranslations("room.controlBar");
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const [leaveMenuOpen, setLeaveMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const compact = !useIsSmUp();
  const moreAnchorRef = useRef<HTMLButtonElement>(null);

  function selectPanel(next: SidePanel) {
    onPanelChange(panel === next ? "none" : next);
    setMoreOpen(false);
  }

  const moreBadge =
    (unreadChat > 0 ? 1 : 0) +
    (insightCount && insightCount > 0 ? 1 : 0) +
    (peopleCount > 1 ? 1 : 0);

  return (
    <div className="relative flex max-w-[calc(100vw-1.5rem)] items-end gap-1.5">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...springSoft, delay: 0.15 }}
        className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl glass-strong p-1.5 shadow-lift"
      >
        <ControlButton
          active={mic.enabled}
          danger={!mic.enabled}
          pending={mic.pending}
          onClick={() => {
            void mic.toggle();
          }}
          label={mic.enabled ? t("muteMic") : t("unmuteMic")}
        >
          {mic.enabled ? <IconMic /> : <IconMicOff />}
        </ControlButton>

        <ControlButton
          active={cam.enabled}
          danger={!cam.enabled}
          pending={cam.pending}
          onClick={() => {
            void cam.toggle();
          }}
          label={cam.enabled ? t("turnOffCam") : t("turnOnCam")}
        >
          {cam.enabled ? <IconVideo /> : <IconVideoOff />}
        </ControlButton>

        {!compact ? (
          <ControlButton
            active={screen.enabled}
            pending={screen.pending}
            onClick={() => {
              void screen.toggle();
            }}
            label={screen.enabled ? t("stopShare") : t("startShare")}
          >
            <IconScreen />
          </ControlButton>
        ) : null}

        <Separator />

        <ControlButton
          active={layout === "spotlight"}
          onClick={() =>
            onLayoutChange(layout === "grid" ? "spotlight" : "grid")
          }
          label={layout === "grid" ? t("spotlightMode") : t("gridMode")}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={layout}
              initial={{ opacity: 0, rotate: -35, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 35, scale: 0.6 }}
              transition={{ duration: 0.2 }}
              className="grid place-items-center"
            >
              {layout === "grid" ? <IconGrid /> : <IconSpotlight />}
            </motion.span>
          </AnimatePresence>
        </ControlButton>

        {compact ? (
          <>
            <ControlButton
              ref={moreAnchorRef}
              active={moreOpen || panel !== "none" || captionsOn}
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
                label={screen.enabled ? t("stopShare") : t("startShare")}
                active={screen.enabled}
                onClick={() => {
                  void screen.toggle();
                  setMoreOpen(false);
                }}
              >
                <IconScreen />
              </MoreItem>
              <MoreItem
                label={captionsOn ? t("hideCaptions") : t("showCaptions")}
                active={captionsOn}
                onClick={() => {
                  onCaptionsToggle();
                  setMoreOpen(false);
                }}
              >
                <IconCaptions />
              </MoreItem>
              <MoreItem
                label={t("fullTranscript")}
                active={panel === "captions"}
                onClick={() => selectPanel("captions")}
              >
                <TranscriptIcon />
              </MoreItem>
              <MoreItem
                label={t("copilot")}
                active={panel === "copilot"}
                badge={
                  insightCount && insightCount > 0
                    ? String(insightCount)
                    : undefined
                }
                onClick={() => selectPanel("copilot")}
              >
                <IconSparkles />
              </MoreItem>
              <MoreItem
                label={t("people")}
                active={panel === "people"}
                badge={peopleCount > 1 ? String(peopleCount) : undefined}
                onClick={() => selectPanel("people")}
              >
                <IconUsers />
              </MoreItem>
              <MoreItem
                label={t("chat")}
                active={panel === "chat"}
                badge={unreadChat > 0 ? String(unreadChat) : undefined}
                badgeTone="danger"
                onClick={() => selectPanel("chat")}
              >
                <IconChat />
              </MoreItem>
            </FloatingMenu>
          </>
        ) : (
          <>
            <ControlButton
              active={captionsOn}
              onClick={onCaptionsToggle}
              label={captionsOn ? t("hideCaptions") : t("showCaptions")}
            >
              <IconCaptions />
            </ControlButton>

            <ControlButton
              active={panel === "captions"}
              onClick={() =>
                onPanelChange(panel === "captions" ? "none" : "captions")
              }
              label={t("fullTranscript")}
            >
              <TranscriptIcon />
            </ControlButton>

            <Separator />

            <ControlButton
              active={panel === "copilot"}
              onClick={() =>
                onPanelChange(panel === "copilot" ? "none" : "copilot")
              }
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
              active={panel === "people"}
              onClick={() =>
                onPanelChange(panel === "people" ? "none" : "people")
              }
              label={t("people")}
              badge={peopleCount > 1 ? String(peopleCount) : undefined}
            >
              <IconUsers />
            </ControlButton>

            <ControlButton
              active={panel === "chat"}
              onClick={() => onPanelChange(panel === "chat" ? "none" : "chat")}
              label={t("chat")}
              badge={unreadChat > 0 ? String(unreadChat) : undefined}
              badgeTone="danger"
            >
              <IconChat />
            </ControlButton>
          </>
        )}
      </motion.div>

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
        className="grid h-11 w-14 place-items-center rounded-xl bg-rose-500 text-white shadow-[0_10px_36px_-12px_rgba(244,63,94,0.9)] transition-colors hover:bg-rose-400"
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

function ControlButton({
  ref,
  children,
  onClick,
  label,
  active,
  danger,
  pending,
  badge,
  badgeTone = "brand",
  className,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  children: ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
  pending?: boolean;
  badge?: string;
  badgeTone?: "brand" | "danger";
  className?: string;
}) {
  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      disabled={pending}
      aria-label={label}
      aria-pressed={active}
      title={label}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={springSoft}
      className={cn(
        "relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-300 disabled:opacity-50",
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
}
