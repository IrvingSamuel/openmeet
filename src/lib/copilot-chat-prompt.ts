export type CopilotChatRole = "user" | "assistant";

export type CopilotChatMessage = {
  id: string;
  role: CopilotChatRole;
  body: string;
  authorName?: string | null;
  authorIdentity?: string | null;
  createdAt: string;
};

export type CopilotChatHistoryItem = {
  role: CopilotChatRole;
  body: string;
  authorName?: string | null;
};

export function buildCopilotChatPrompt(opts: {
  transcript: string;
  chatHistory: CopilotChatHistoryItem[];
  message: string;
  /** Human language label for the LLM (e.g. "português (pt-BR)"). */
  languageLabel?: string;
}): string {
  const lang = opts.languageLabel || "português (pt-BR)";
  const historyText =
    opts.chatHistory.length === 0
      ? "(sem mensagens anteriores)"
      : opts.chatHistory
          .map((m) => {
            const label =
              m.role === "assistant"
                ? "Copiloto"
                : m.authorName?.trim() || "Participante";
            return `${label}: ${m.body}`;
          })
          .join("\n");

  const transcriptText = opts.transcript.trim()
    ? opts.transcript
    : "(ainda sem transcrição — a reunião pode ter acabado de começar)";

  return `Você é o Copiloto Chronos Meet durante uma reunião ao vivo (${lang}).
Responda de forma concisa e útil com base na transcrição e no histórico de perguntas.
Se não houver transcrição ainda, diga isso claramente.
Não invente falas ou decisões que não apareçam na transcrição.
Use markdown simples quando útil (negrito, listas) — sem blocos de código longos.
Responda em ${lang}.

Transcrição recente:
${transcriptText}

Histórico de conversa:
${historyText}

Pergunta actual:
${opts.message.trim()}`;
}

export function formatAssistantFallback(opts: {
  offline?: boolean;
  billingDepleted?: boolean;
  error?: string;
}): string {
  if (opts.billingDepleted) {
    return "O Copiloto está temporariamente indisponível — créditos Gemini esgotados. Tente novamente mais tarde.";
  }
  if (opts.offline) {
    return "O Copiloto está temporariamente indisponível. Verifique a configuração do servidor ou tente novamente.";
  }
  if (opts.error) {
    return `Não foi possível obter resposta: ${opts.error.slice(0, 200)}`;
  }
  return "Não foi possível obter resposta do Copiloto. Tente novamente.";
}

const EXPAND_CONTEXT_RE =
  /\b(resumo|resume|resuma|insights?|lista|listar|quem\s+falou|principais?\s+pontos?|decis[oõ]es|action\s*items?)\b/i;

/** Wider transcript/history when the user asks for summary-style answers. */
export function needsExpandedContext(message: string): boolean {
  return EXPAND_CONTEXT_RE.test(message);
}
