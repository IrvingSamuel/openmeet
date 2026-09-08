import { describe, expect, it } from "vitest";
import {
  buildCopilotChatPrompt,
  formatAssistantFallback,
} from "@/lib/copilot-chat-prompt";

describe("buildCopilotChatPrompt", () => {
  it("includes transcript, history, and question", () => {
    const prompt = buildCopilotChatPrompt({
      transcript: "Ana: fechamos o piloto.\nCaio: preciso do jurídico.",
      chatHistory: [
        { role: "user", body: "Quem falou sobre jurídico?", authorName: "Ivo" },
        {
          role: "assistant",
          body: "Caio mencionou o jurídico.",
        },
      ],
      message: "Qual é o prazo?",
    });

    expect(prompt).toContain("Ana: fechamos o piloto.");
    expect(prompt).toContain("Ivo: Quem falou sobre jurídico?");
    expect(prompt).toContain("Copiloto: Caio mencionou o jurídico.");
    expect(prompt).toContain("Pergunta actual:\nQual é o prazo?");
  });

  it("handles empty transcript and history", () => {
    const prompt = buildCopilotChatPrompt({
      transcript: "",
      chatHistory: [],
      message: "Resuma a reunião",
    });

    expect(prompt).toContain("(ainda sem transcrição");
    expect(prompt).toContain("(sem mensagens anteriores)");
    expect(prompt).toContain("Resuma a reunião");
  });
});

describe("formatAssistantFallback", () => {
  it("returns billing message when credits depleted", () => {
    expect(
      formatAssistantFallback({ billingDepleted: true, offline: true }),
    ).toContain("limite de API");
  });

  it("returns generic offline message", () => {
    expect(formatAssistantFallback({ offline: true })).toContain(
      "temporariamente indisponível",
    );
  });

  it("truncates error details", () => {
    const msg = formatAssistantFallback({
      error: "x".repeat(300),
    });
    expect(msg.length).toBeLessThan(260);
  });
});

describe("copilot chat POST schema", () => {
  it("accepts valid payload shape", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      meetingId: z.string().uuid(),
      message: z.string().trim().min(1).max(2000),
      displayName: z.string().trim().min(1).max(120),
      livekitIdentity: z.string().trim().min(1).max(200),
    });

    const parsed = schema.parse({
      meetingId: "019fadf2-9995-7112-80a2-268dff005e9a",
      message: "Quem falou sobre o contrato?",
      displayName: "Ana",
      livekitIdentity: "user-ana",
    });

    expect(parsed.message).toBe("Quem falou sobre o contrato?");
  });

  it("rejects empty message", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      meetingId: z.string().uuid(),
      message: z.string().trim().min(1).max(2000),
      displayName: z.string().trim().min(1).max(120),
      livekitIdentity: z.string().trim().min(1).max(200),
    });

    expect(() =>
      schema.parse({
        meetingId: "019fadf2-9995-7112-80a2-268dff005e9a",
        message: "   ",
        displayName: "Ana",
        livekitIdentity: "user-ana",
      }),
    ).toThrow();
  });
});
