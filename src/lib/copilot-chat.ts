import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { copilotChatMessages, transcriptSegments } from "@/db/schema";
import { callGeminiSafe } from "@/lib/gemini";
import { localePromptLabel, resolveLocale } from "@/lib/app-settings";
import {
  assertChatQuota,
  recordLlmUsage,
} from "@/lib/llm-usage";
import {
  buildCopilotChatPrompt,
  formatAssistantFallback,
  needsExpandedContext,
  type CopilotChatHistoryItem,
  type CopilotChatMessage,
  type CopilotChatRole,
} from "@/lib/copilot-chat-prompt";

export type {
  CopilotChatHistoryItem,
  CopilotChatMessage,
  CopilotChatRole,
} from "@/lib/copilot-chat-prompt";
export {
  buildCopilotChatPrompt,
  formatAssistantFallback,
  needsExpandedContext,
} from "@/lib/copilot-chat-prompt";

/** Default (cheap) context window. */
const TRANSCRIPT_LIMIT_DEFAULT = 20;
const CHAT_HISTORY_LIMIT_DEFAULT = 6;
/** Expanded when the user asks for summary / who-said / list. */
const TRANSCRIPT_LIMIT_EXPANDED = 40;
const CHAT_HISTORY_LIMIT_EXPANDED = 10;
const MESSAGE_LIST_LIMIT = 200;

export async function loadCopilotChatContext(
  meetingId: string,
  opts?: { expand?: boolean },
) {
  const expand = Boolean(opts?.expand);
  const transcriptLimit = expand
    ? TRANSCRIPT_LIMIT_EXPANDED
    : TRANSCRIPT_LIMIT_DEFAULT;
  const historyLimit = expand
    ? CHAT_HISTORY_LIMIT_EXPANDED
    : CHAT_HISTORY_LIMIT_DEFAULT;

  const segments = await db.query.transcriptSegments.findMany({
    where: eq(transcriptSegments.meetingId, meetingId),
    orderBy: [desc(transcriptSegments.createdAt)],
    limit: transcriptLimit,
  });
  const chronological = [...segments].reverse();
  const transcript = chronological
    .map((s) => `${s.speakerLabel}: ${s.text}`)
    .join("\n");

  const priorMessages = await db.query.copilotChatMessages.findMany({
    where: eq(copilotChatMessages.meetingId, meetingId),
    orderBy: [desc(copilotChatMessages.createdAt)],
    limit: historyLimit,
  });
  const chatHistory: CopilotChatHistoryItem[] = [...priorMessages]
    .reverse()
    .map((m) => ({
      role: m.role as CopilotChatRole,
      body: m.body,
      authorName: m.authorName,
    }));

  return { transcript, chatHistory, expand };
}

export async function listCopilotChatMessages(
  meetingId: string,
): Promise<CopilotChatMessage[]> {
  const rows = await db.query.copilotChatMessages.findMany({
    where: eq(copilotChatMessages.meetingId, meetingId),
    orderBy: [asc(copilotChatMessages.createdAt)],
    limit: MESSAGE_LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role as CopilotChatRole,
    body: row.body,
    authorName: row.authorName,
    authorIdentity: row.authorIdentity,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function sendCopilotChatMessage(opts: {
  meetingId: string;
  message: string;
  displayName: string;
  livekitIdentity: string;
}) {
  const trimmed = opts.message.trim();

  const quota = await assertChatQuota(opts.meetingId, opts.livekitIdentity);
  if (!quota.ok) {
    throw Object.assign(new Error(quota.error), { code: "chat_quota" as const });
  }

  const expand = needsExpandedContext(trimmed);
  const { transcript, chatHistory } = await loadCopilotChatContext(
    opts.meetingId,
    { expand },
  );
  const locale = await resolveLocale();
  const prompt = buildCopilotChatPrompt({
    transcript,
    chatHistory,
    message: trimmed,
    languageLabel: localePromptLabel(locale),
  });

  const [userRow] = await db
    .insert(copilotChatMessages)
    .values({
      meetingId: opts.meetingId,
      role: "user",
      body: trimmed,
      authorName: opts.displayName.trim(),
      authorIdentity: opts.livekitIdentity,
    })
    .returning();

  const gemini = await callGeminiSafe(prompt, { maxOutputTokens: 1024 });
  void recordLlmUsage({
    meetingId: opts.meetingId,
    feature: "chat",
    gemini,
    actorIdentity: opts.livekitIdentity,
  });

  const assistantBody =
    gemini.offline || !gemini.text.trim()
      ? formatAssistantFallback(gemini)
      : gemini.text.trim();

  const [assistantRow] = await db
    .insert(copilotChatMessages)
    .values({
      meetingId: opts.meetingId,
      role: "assistant",
      body: assistantBody,
    })
    .returning();

  return {
    userMessage: {
      id: userRow.id,
      role: "user" as const,
      body: userRow.body,
      authorName: userRow.authorName,
      authorIdentity: userRow.authorIdentity,
      createdAt: userRow.createdAt.toISOString(),
    },
    assistantMessage: {
      id: assistantRow.id,
      role: "assistant" as const,
      body: assistantRow.body,
      authorName: null,
      authorIdentity: null,
      createdAt: assistantRow.createdAt.toISOString(),
    },
    warning: gemini.error,
    expandedContext: expand,
  };
}
