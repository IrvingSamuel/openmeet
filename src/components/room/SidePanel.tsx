"use client";

import {
  useParticipants,
  type ReceivedChatMessage,
} from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, hueFromString, initials } from "@/lib/utils";
import { EASE_OUT_EXPO, springSoft } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import {
  IconArrowRight,
  IconMicOff,
  IconVideoOff,
} from "@/components/ui/icons";
import type { SidePanel as PanelKind } from "@/components/room/ControlBar";
import type { Caption } from "@/components/room/Captions";
import type { CopilotInsight } from "@/lib/captions";
import type { CopilotChatMessage } from "@/lib/copilot-chat-prompt";
import { isAgentParticipant } from "@/lib/participants";
import { useToast } from "@/components/ui/Toast";
import { useCopilotChat } from "@/hooks/useCopilotChat";

export type ChatSend = (
  message: string,
  options?: { topic?: string },
) => Promise<unknown>;

export function SidePanel({
  panel,
  onClose,
  captions,
  insights,
  insightsLoading,
  insightsFromCache,
  insightsRegenCount,
  onRefreshInsights,
  chatMessages,
  sendChat,
  chatSending,
  onChatRead,
  roomSlug,
  meetingId,
  isHost,
  copilotDisplayName,
  copilotIdentity,
  overlay = false,
}: {
  panel: PanelKind;
  onClose: () => void;
  captions: Caption[];
  insights: CopilotInsight[];
  insightsLoading?: boolean;
  insightsFromCache?: boolean;
  insightsRegenCount?: number;
  onRefreshInsights?: () => void | Promise<void>;
  chatMessages: ReceivedChatMessage[];
  sendChat: ChatSend;
  chatSending?: boolean;
  onChatRead: () => void;
  roomSlug?: string;
  meetingId?: string;
  isHost?: boolean;
  copilotDisplayName?: string;
  copilotIdentity?: string;
  /** Below lg: render as full-height overlay so the stage keeps full width. */
  overlay?: boolean;
}) {
  const t = useTranslations("room.sidePanel");
  const tLabels = useTranslations("common.labels");
  const titles: Record<Exclude<PanelKind, "none">, string> = {
    chat: t("chat"),
    people: t("people"),
    captions: t("captions"),
    copilot: t("copilot"),
  };

  const body =
    panel !== "none" ? (
      <>
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight">
            {titles[panel]}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
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
        </header>

        <div className="min-h-0 flex-1">
          {panel === "chat" ? (
            <ChatPanel
              messages={chatMessages}
              send={sendChat}
              isSending={chatSending}
              onRead={onChatRead}
            />
          ) : null}
          {panel === "people" ? (
            <PeoplePanel
              roomSlug={roomSlug}
              meetingId={meetingId}
              isHost={isHost}
            />
          ) : null}
          {panel === "captions" ? (
            <TranscriptPanel captions={captions} />
          ) : null}
          {panel === "copilot" ? (
            <CopilotPanel
              insights={insights}
              insightsLoading={insightsLoading}
              insightsFromCache={insightsFromCache}
              insightsRegenCount={insightsRegenCount}
              onRefreshInsights={onRefreshInsights}
              meetingId={meetingId}
              panelOpen={panel === "copilot"}
              displayName={copilotDisplayName ?? tLabels("participant")}
              livekitIdentity={copilotIdentity ?? "guest"}
            />
          ) : null}
        </div>
      </>
    ) : null;

  if (overlay) {
    return (
      <AnimatePresence>
        {panel !== "none" ? (
          <motion.div
            key="panel-overlay"
            className="absolute inset-0 z-40 flex flex-col justify-end sm:justify-center sm:items-end sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.button
              type="button"
              aria-label={t("close")}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={titles[panel]}
              initial={{ y: "100%", opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "40%", opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
              className={cn(
                "relative z-10 flex w-full flex-col overflow-hidden glass",
                "h-[min(88dvh,720px)] rounded-t-3xl",
                "sm:ml-auto sm:h-full sm:max-h-full sm:w-[min(360px,92vw)] sm:rounded-3xl sm:translate-y-0",
              )}
            >
              <div
                aria-hidden
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden"
              />
              {body}
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {panel !== "none" ? (
        <motion.aside
          key="panel"
          initial={{ x: 40, opacity: 0, filter: "blur(10px)" }}
          animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ x: 40, opacity: 0, filter: "blur(10px)" }}
          transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          className="flex h-full w-[min(360px,86vw)] shrink-0 flex-col overflow-hidden rounded-3xl glass"
        >
          {body}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function ChatPanel({
  messages,
  send,
  isSending,
  onRead,
}: {
  messages: ReceivedChatMessage[];
  send: ChatSend;
  isSending?: boolean;
  onRead: () => void;
}) {
  const t = useTranslations("room.sidePanel");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onRead();
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, onRead]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-ink-faint">
            {t("chatEmpty")}
          </p>
        ) : (
          messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          await send(text);
        }}
        className="flex items-center gap-2 border-t border-line p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("chatPlaceholder")}
          aria-label={t("chatAria")}
          className="w-full rounded-xl border border-line bg-black/30 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
        />
        <Button
          type="submit"
          size="sm"
          loading={isSending}
          disabled={!draft.trim()}
          aria-label={t("sendMessage")}
          className="shrink-0 px-3"
        >
          <IconArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: ReceivedChatMessage }) {
  const tLabels = useTranslations("common.labels");
  const from = message.from;
  const name = from?.name || from?.identity || tLabels("anonymous");
  const mine = Boolean(from?.isLocal);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSoft}
      className={cn("flex flex-col gap-1", mine && "items-end")}
    >
      <span className="px-1 text-[11px] text-ink-faint">
        {mine ? tLabels("you") : name}
      </span>
      <p
        className={cn(
          "max-w-[85%] text-pretty rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          mine
            ? "rounded-br-md bg-brand-gradient text-white"
            : "rounded-bl-md border border-line bg-white/[0.05] text-ink",
        )}
      >
        {message.message}
      </p>
    </motion.div>
  );
}

function PeoplePanel({
  roomSlug,
  meetingId,
  isHost,
}: {
  roomSlug?: string;
  meetingId?: string;
  isHost?: boolean;
}) {
  const participants = useParticipants();
  const toast = useToast();
  const t = useTranslations("room.sidePanel");
  const tLabels = useTranslations("common.labels");
  const tToast = useTranslations("common.toast");
  const tErrors = useTranslations("common.errors");
  const [busyId, setBusyId] = useState<string | null>(null);
  const humans = participants.filter((p) => !isAgentParticipant(p));

  async function moderate(
    identity: string,
    action: "mute" | "camera_off" | "remove",
  ) {
    if (!roomSlug || !isHost) return;
    if (action === "remove") {
      const ok = window.confirm(t("removeConfirm"));
      if (!ok) return;
    }
    setBusyId(`${identity}:${action}`);
    try {
      const res = await fetch(`/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, identity, meetingId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || t("moderateFailed"));
        return;
      }
      if (action === "mute") toast.push(tToast("micMuted"));
      if (action === "camera_off") toast.push(tToast("cameraOff"));
      if (action === "remove") toast.push(tToast("participantRemoved"));
    } catch {
      toast.error(tErrors("networkModerate"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {isHost && roomSlug ? (
        <WaitingQueue roomSlug={roomSlug} />
      ) : null}
      <ul className="space-y-1.5 px-3 py-3">
        <AnimatePresence initial={false}>
          {humans.map((p) => {
            const name = p.name || p.identity;
            const hue = hueFromString(p.identity);
            const canModerate = Boolean(isHost && !p.isLocal && roomSlug);
            return (
              <motion.li
                key={p.identity}
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={springSoft}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                  style={{
                    background: `linear-gradient(135deg, hsl(${hue} 62% 44%), hsl(${hue} 62% 28%))`,
                  }}
                >
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {name}
                    {p.isLocal ? ` ${tLabels("youParen")}` : ""}
                    {p.isLocal && isHost ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-brand-secondary">
                        {tLabels("host")}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {p.isMicrophoneEnabled ? tLabels("micActive") : tLabels("muted")}
                    {p.isCameraEnabled
                      ? ` · ${tLabels("cameraOn")}`
                      : ` · ${tLabels("cameraOff")}`}
                    {p.isScreenShareEnabled
                      ? ` · ${tLabels("screenShare")}`
                      : ""}
                  </span>
                </span>
                {canModerate ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title={t("muteAction")}
                      disabled={busyId?.startsWith(p.identity)}
                      onClick={() => void moderate(p.identity, "mute")}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
                    >
                      <IconMicOff className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("cameraOffAction")}
                      disabled={busyId?.startsWith(p.identity)}
                      onClick={() => void moderate(p.identity, "camera_off")}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
                    >
                      <IconVideoOff className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("removeAction")}
                      disabled={busyId?.startsWith(p.identity)}
                      onClick={() => void moderate(p.identity, "remove")}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-rose-400/30 text-rose-300 transition-colors hover:bg-rose-500/15 disabled:opacity-40"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M5 5l10 10M15 5L5 15" />
                      </svg>
                    </button>
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

type WaitingRequest = {
  id: string;
  displayName: string;
  createdAt: string;
};

function WaitingQueue({ roomSlug }: { roomSlug: string }) {
  const toast = useToast();
  const t = useTranslations("room.sidePanel");
  const tActions = useTranslations("common.actions");
  const tToast = useTranslations("common.toast");
  const tErrors = useTranslations("common.errors");
  const [requests, setRequests] = useState<WaitingRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/join-requests`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        setRequests(json.requests ?? []);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomSlug]);

  async function decide(id: string, decision: "approve" | "deny") {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/meetings/by-slug/${encodeURIComponent(roomSlug)}/join-requests/${id}/${decision}`,
        { method: "POST" },
      );
      if (!res.ok) {
        toast.error(tErrors("updateRequest"));
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.push(
        decision === "approve"
          ? tToast("entryApproved")
          : tToast("requestDenied"),
      );
    } catch {
      toast.error(tToast("networkError"));
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="border-b border-line px-3 py-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {t("waitingQueue", { count: requests.length })}
      </p>
      <ul className="space-y-1.5">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 rounded-xl bg-amber-400/10 px-2.5 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {r.displayName}
            </span>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => void decide(r.id, "approve")}
              className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              {tActions("approve")}
            </button>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => void decide(r.id, "deny")}
              className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-40"
            >
              {tActions("deny")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TranscriptPanel({ captions }: { captions: Caption[] }) {
  const t = useTranslations("room.sidePanel");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [captions.length]);

  return (
    <div className="h-full space-y-3 overflow-y-auto px-5 py-4">
      {captions.length === 0 ? (
        <p className="pt-8 text-center text-sm text-ink-faint">
          {t("transcriptEmpty")}
        </p>
      ) : (
        captions.map((c, i) => (
          <motion.p
            key={`${c.speaker}-${i}-${c.text.slice(0, 24)}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm leading-relaxed text-ink-muted"
          >
            <span className="font-semibold text-brand-secondary">
              {c.speaker}:{" "}
            </span>
            {c.text}
          </motion.p>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}

const KIND_TONE: Record<CopilotInsight["kind"], string> = {
  insight: "border-brand-primary/40 bg-brand-primary/10 text-brand-secondary",
  observation: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  suggestion: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
};

function CopilotPanel({
  insights,
  insightsLoading,
  insightsFromCache,
  insightsRegenCount = 0,
  onRefreshInsights,
  meetingId,
  panelOpen,
  displayName,
  livekitIdentity,
}: {
  insights: CopilotInsight[];
  insightsLoading?: boolean;
  insightsFromCache?: boolean;
  insightsRegenCount?: number;
  onRefreshInsights?: () => void | Promise<void>;
  meetingId?: string;
  panelOpen: boolean;
  displayName: string;
  livekitIdentity: string;
}) {
  const toast = useToast();
  const t = useTranslations("room.sidePanel");
  const tActions = useTranslations("common.actions");
  const tKind = useTranslations("common.copilotKind");
  const tMeta = useTranslations("meta");
  const [tab, setTab] = useState<"insights" | "chat">("insights");
  const insightsEndRef = useRef<HTMLDivElement>(null);
  const { messages, isSending, error, sendMessage } = useCopilotChat({
    meetingId,
    panelOpen,
    chatTabActive: tab === "chat",
    displayName,
    livekitIdentity,
    onVoiceReply: (authorName) => {
      setTab("chat");
      toast.push(t("copilotReplied", { name: authorName }));
    },
  });

  useEffect(() => {
    if (tab !== "insights") return;
    insightsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [insights.length, tab]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-line px-4 py-2.5">
        {(
          [
            ["insights", t("tabInsights")],
            ["chat", t("tabChat")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
              tab === key
                ? "bg-brand-primary/20 text-brand-secondary"
                : "text-ink-faint hover:bg-white/[0.06] hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {panelOpen ? (
        <p className="border-b border-line px-4 py-2 text-[11px] text-ink-faint">
          {t("voiceHint")}
        </p>
      ) : null}

      {tab === "insights" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            <p className="text-[11px] text-ink-faint">
              {insightsFromCache ? t("insightsCached") : t("insightsLive")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={insightsLoading}
              disabled={insightsLoading || insightsRegenCount >= 3}
              onClick={() => {
                void Promise.resolve(onRefreshInsights?.()).catch(() => {
                  toast.error(t("insightsRefreshFailed"));
                });
              }}
              className="shrink-0 text-[11px]"
            >
              {tActions("refresh")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {insights.length === 0 ? (
              <p className="pt-6 text-center text-sm text-ink-faint">
                {insightsLoading
                  ? tMeta("generatingInsights")
                  : t("insightsEmpty")}
              </p>
            ) : (
              insights.map((item, i) => (
                <motion.article
                  key={`${item.kind}-${item.at ?? i}-${i}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springSoft}
                  className={cn(
                    "rounded-2xl border px-3.5 py-3 text-sm leading-relaxed",
                    KIND_TONE[item.kind],
                  )}
                >
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider opacity-70">
                    {tKind(item.kind)}
                  </span>
                  {item.text}
                </motion.article>
              ))
            )}
            <div ref={insightsEndRef} />
          </div>
        </div>
      ) : (
        <CopilotChatTab
          messages={messages}
          isSending={isSending}
          error={error}
          onSend={sendMessage}
          localIdentity={livekitIdentity}
        />
      )}
    </div>
  );
}

function CopilotChatTab({
  messages,
  isSending,
  error,
  onSend,
  localIdentity,
}: {
  messages: CopilotChatMessage[];
  isSending: boolean;
  error: string | null;
  onSend: (text: string) => Promise<void>;
  localIdentity: string;
}) {
  const t = useTranslations("room.sidePanel");
  const tMeta = useTranslations("meta");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-ink-faint">
            {t("copilotEmpty")}
          </p>
        ) : (
          messages.map((msg) => (
            <CopilotChatBubble
              key={msg.id}
              message={msg}
              mine={
                msg.role === "user" && msg.authorIdentity === localIdentity
              }
            />
          ))
        )}
        {isSending ? (
          <p className="px-1 text-xs text-ink-faint">{tMeta("copilotThinking")}</p>
        ) : null}
        <div ref={endRef} />
      </div>
      {error ? (
        <p className="border-t border-line px-4 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text || isSending) return;
          setDraft("");
          await onSend(text);
        }}
        className="flex items-center gap-2 border-t border-line p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("copilotPlaceholder")}
          aria-label={t("copilotAria")}
          className="w-full rounded-xl border border-line bg-black/30 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
        />
        <Button
          type="submit"
          size="sm"
          loading={isSending}
          disabled={!draft.trim() || isSending}
          aria-label={t("sendQuestion")}
          className="shrink-0 px-3"
        >
          <IconArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function normalizeAssistantMarkdown(text: string): string {
  return text.replace(/\\([*_`[\]#])/g, "$1");
}

function CopilotChatBubble({
  message,
  mine,
}: {
  message: CopilotChatMessage;
  mine: boolean;
}) {
  const t = useTranslations("room.sidePanel");
  const tLabels = useTranslations("common.labels");
  const isAssistant = message.role === "assistant";
  const label = isAssistant
    ? t("copilotName")
    : mine
      ? tLabels("you")
      : message.authorName || tLabels("participant");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSoft}
      className={cn(
        "flex flex-col gap-1",
        !isAssistant && mine && "items-end",
      )}
    >
      <span className="px-1 text-[11px] text-ink-faint">{label}</span>
      <div
        className={cn(
          "max-w-[85%] text-pretty rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isAssistant
            ? "rounded-bl-md border border-brand-primary/40 bg-brand-primary/10 text-brand-secondary"
            : mine
              ? "rounded-br-md bg-brand-gradient text-white"
              : "rounded-bl-md border border-line bg-white/[0.05] text-ink",
        )}
      >
        {isAssistant ? (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-p:leading-relaxed prose-strong:font-semibold prose-strong:text-brand-secondary prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-li:marker:text-brand-secondary/70">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {normalizeAssistantMarkdown(message.body)}
            </ReactMarkdown>
          </div>
        ) : (
          message.body
        )}
      </div>
    </motion.div>
  );
}
