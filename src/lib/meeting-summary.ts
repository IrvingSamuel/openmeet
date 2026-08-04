import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  meetings,
  transcriptSegments,
  meetingSummaries,
  actionItems,
  rooms,
} from "@/db/schema";
import {
  callGeminiSafe,
  extractJsonBlock,
  offlineSummaryMarkdown,
  resolveSummaryGeminiModel,
} from "@/lib/gemini";
import { localePromptLabel, resolveLocale } from "@/lib/app-settings";
import { recordLlmUsage } from "@/lib/llm-usage";
import {
  sampleTranscriptForSummary,
  SUMMARY_TRANSCRIPT_CHAR_CAP,
} from "@/lib/transcript-sample";
import { dispatchSummaryReadyWebhooks } from "@/lib/outbound-webhooks";

export type SuggestedAction = {
  title: string;
  description?: string;
  assigneeHint?: string;
  dueDateHint?: string;
  priority?: "low" | "medium" | "high" | "critical";
  checklist?: string[];
  boardHint?: string | null;
};

export { sampleTranscriptForSummary, SUMMARY_TRANSCRIPT_CHAR_CAP };

export async function tryClaimSummary(
  meetingId: string,
  force?: boolean,
): Promise<"claimed" | "busy" | "ready"> {
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) throw new Error("not_found");

  if (!force && meeting.summaryStatus === "ready") return "ready";
  if (!force && meeting.summaryStatus === "running") return "busy";

  if (force) {
    await db
      .update(meetings)
      .set({ summaryStatus: "running" })
      .where(eq(meetings.id, meetingId));
    return "claimed";
  }

  const updated = await db
    .update(meetings)
    .set({ summaryStatus: "running" })
    .where(
      and(
        eq(meetings.id, meetingId),
        ne(meetings.summaryStatus, "running"),
        ne(meetings.summaryStatus, "ready"),
      ),
    )
    .returning({ id: meetings.id });

  if (updated.length === 0) {
    const again = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
    });
    if (again?.summaryStatus === "ready") return "ready";
    return "busy";
  }
  return "claimed";
}

export async function generateMeetingSummary(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting) throw new Error("not_found");

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, meeting.roomId),
  });
  const segments = await db.query.transcriptSegments.findMany({
    where: eq(transcriptSegments.meetingId, meeting.id),
    orderBy: [asc(transcriptSegments.createdAt)],
  });

  const transcriptFull = segments
    .map((s) => `${s.speakerLabel}: ${s.text}`)
    .join("\n");
  const transcript = sampleTranscriptForSummary(transcriptFull);

  const locale = await resolveLocale();
  const lang = localePromptLabel(locale);
  const prompt = `Você é o copiloto Chronos Meet. Analise a reunião em ${lang}.

Produza markdown com exatamente estas secções (use estes títulos ##):
## Principais pontos
## Insights gerados
## Observações e anotações
## Sugestões de tarefas

Transcrição${transcriptFull.length > transcript.length ? " (amostrada início/meio/fim)" : ""}:
${transcript || "(sem segmentos — reunião sem áudio transcrito)"}

No final, emita um bloco JSON estrito delimitado por <actions> e </actions> com array:
[{
  "title":"...",
  "description":"...",
  "assigneeHint":"Nome se mencionado",
  "dueDateHint":"YYYY-MM-DD se prazo mencionado, senão omitir",
  "priority":"low|medium|high|critical",
  "checklist":["passo 1","passo 2"],
  "boardHint":null
}]
Máximo 8 tarefas. Checklist só quando houver passos claros.
Escreva o markdown e os títulos das tarefas em ${lang}.`;

  const modelName = await resolveSummaryGeminiModel();
  const gemini = await callGeminiSafe(prompt, {
    model: modelName,
    maxOutputTokens: 4096,
  });
  void recordLlmUsage({
    meetingId: meeting.id,
    feature: "summary",
    gemini,
  });

  let summaryMarkdown: string;
  let actions: SuggestedAction[] = [];
  let model = gemini.model || modelName;

  if (gemini.offline || !gemini.text.trim()) {
    const reason = gemini.billingDepleted
      ? "créditos Gemini esgotados (429)"
      : gemini.error || "LLM indisponível";
    summaryMarkdown = offlineSummaryMarkdown(transcript, reason, {
      billingDepleted: Boolean(gemini.billingDepleted),
    });
    model = "offline-fallback";
  } else {
    const { rest, data } = extractJsonBlock<SuggestedAction[]>(
      gemini.text,
      "actions",
    );
    summaryMarkdown = rest;
    actions = Array.isArray(data)
      ? data.filter((a) => a && typeof a.title === "string" && a.title.trim())
      : [];
  }

  await db
    .insert(meetingSummaries)
    .values({
      meetingId: meeting.id,
      summaryMarkdown,
      model,
    })
    .onConflictDoUpdate({
      target: meetingSummaries.meetingId,
      set: {
        summaryMarkdown,
        model,
      },
    });

  await db.delete(actionItems).where(eq(actionItems.meetingId, meeting.id));

  const createdItems = [];
  for (const a of actions) {
    const [item] = await db
      .insert(actionItems)
      .values({
        meetingId: meeting.id,
        title: a.title.trim(),
        assigneeHint: a.assigneeHint,
        chronosBoardId: room?.boardId,
        status: "pending",
        raw: a,
      })
      .returning();
    createdItems.push(item);
  }

  await db
    .update(meetings)
    .set({ summaryStatus: "ready" })
    .where(eq(meetings.id, meeting.id));

  void dispatchSummaryReadyWebhooks(meeting.id).catch((err) => {
    console.error("[chronos-meet] summary webhooks failed", err);
  });

  return {
    summaryMarkdown,
    actionItems: createdItems,
    offline: gemini.offline,
    billingDepleted: Boolean(gemini.billingDepleted),
    warning: gemini.error,
  };
}
