"use client";

import { useDataChannel } from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CopilotChatMessage } from "@/lib/copilot-chat-prompt";

const POLL_MS = 5000;
const OPTIMISTIC_PREFIX = "optimistic-";

function sortByCreatedAt(messages: CopilotChatMessage[]) {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function isOptimisticId(id: string) {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

function matchesUserMessage(a: CopilotChatMessage, b: CopilotChatMessage) {
  return (
    a.role === "user" &&
    b.role === "user" &&
    a.body === b.body &&
    a.authorIdentity === b.authorIdentity
  );
}

/** Keep pending optimistic rows only until the server copy arrives. */
export function reconcileMessages(
  server: CopilotChatMessage[],
  local: CopilotChatMessage[],
): CopilotChatMessage[] {
  const optimistic = local.filter((m) => isOptimisticId(m.id));
  const pending = optimistic.filter(
    (o) => !server.some((s) => matchesUserMessage(o, s)),
  );
  const map = new Map<string, CopilotChatMessage>();
  for (const m of server) map.set(m.id, m);
  for (const m of pending) map.set(m.id, m);
  return sortByCreatedAt([...map.values()]);
}

function mergeVoiceExchange(
  prev: CopilotChatMessage[],
  userMessage: CopilotChatMessage,
  assistantMessage: CopilotChatMessage,
) {
  const existing = prev.filter((m) => !isOptimisticId(m.id));
  const merged = new Map<string, CopilotChatMessage>();
  for (const m of existing) merged.set(m.id, m);
  merged.set(userMessage.id, userMessage);
  merged.set(assistantMessage.id, assistantMessage);
  return sortByCreatedAt([...merged.values()]);
}

type VoiceExchangePayload = {
  type?: string;
  userMessage?: CopilotChatMessage;
  assistantMessage?: CopilotChatMessage;
};

export function useCopilotChat(opts: {
  meetingId?: string;
  panelOpen: boolean;
  chatTabActive: boolean;
  displayName: string;
  livekitIdentity: string;
  onVoiceReply?: (authorName: string) => void;
}) {
  const {
    meetingId,
    panelOpen,
    chatTabActive,
    displayName,
    livekitIdentity,
    onVoiceReply,
  } = opts;
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const sendingRef = useRef(false);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const onVoiceReplyRef = useRef(onVoiceReply);
  onVoiceReplyRef.current = onVoiceReply;

  const fetchMessages = useCallback(async () => {
    if (!meetingId) return;
    const res = await fetch(
      `/api/meetings/copilot/chat?meetingId=${encodeURIComponent(meetingId)}`,
    );
    if (!res.ok) {
      throw new Error(res.status === 403 ? "forbidden" : "fetch_failed");
    }
    const json = (await res.json()) as { messages?: CopilotChatMessage[] };
    setMessages((prev) => reconcileMessages(json.messages ?? [], prev));
    hydrated.current = true;
  }, [meetingId]);

  const onVoiceData = useCallback((msg: { payload: Uint8Array }) => {
    if (!panelOpenRef.current) return;
    try {
      const json = JSON.parse(
        new TextDecoder().decode(msg.payload),
      ) as VoiceExchangePayload;
      if (json.type !== "voice_exchange") return;
      if (!json.userMessage || !json.assistantMessage) return;
      setMessages((prev) =>
        mergeVoiceExchange(prev, json.userMessage!, json.assistantMessage!),
      );
      const name = json.userMessage.authorName?.trim() || "Alguém";
      onVoiceReplyRef.current?.(name);
    } catch {
      /* ignore malformed frames */
    }
  }, []);

  useDataChannel("copilot-voice", onVoiceData);

  useEffect(() => {
    if (!meetingId || !panelOpen) return;
    let cancelled = false;
    void fetchMessages()
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar o chat do Copiloto.");
      })
      .finally(() => {
        if (!cancelled) setError(null);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, panelOpen, fetchMessages]);

  useEffect(() => {
    if (!meetingId || !panelOpen || !chatTabActive || sendingRef.current) return;
    const id = setInterval(() => {
      if (sendingRef.current) return;
      void fetchMessages().catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [meetingId, panelOpen, chatTabActive, fetchMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !meetingId || isSending || sendingRef.current) return;

      const optimistic: CopilotChatMessage = {
        id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
        role: "user",
        body: trimmed,
        authorName: displayName,
        authorIdentity: livekitIdentity,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => sortByCreatedAt([...prev, optimistic]));
      setIsSending(true);
      sendingRef.current = true;
      setError(null);

      try {
        const res = await fetch("/api/meetings/copilot/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            message: trimmed,
            displayName,
            livekitIdentity,
            source: "text",
          }),
        });
        if (!res.ok) {
          throw new Error(res.status === 403 ? "forbidden" : "send_failed");
        }
        const json = (await res.json()) as {
          userMessage: CopilotChatMessage;
          assistantMessage: CopilotChatMessage;
        };
        setMessages((prev) => {
          const existing = prev.filter((m) => !isOptimisticId(m.id));
          const merged = new Map<string, CopilotChatMessage>();
          for (const m of existing) merged.set(m.id, m);
          merged.set(json.userMessage.id, json.userMessage);
          merged.set(json.assistantMessage.id, json.assistantMessage);
          return sortByCreatedAt([...merged.values()]);
        });
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setError("Não foi possível enviar a mensagem. Tente novamente.");
      } finally {
        sendingRef.current = false;
        setIsSending(false);
      }
    },
    [meetingId, displayName, livekitIdentity, isSending],
  );

  return { messages, isSending, error, sendMessage };
}
