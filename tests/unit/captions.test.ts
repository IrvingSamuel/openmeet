import { describe, expect, it } from "vitest";
import { captionsSimilar, parseCaption } from "@/lib/captions";

function encode(value: unknown) {
  return new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

describe("parseCaption", () => {
  it("parses a well formed caption frame", () => {
    const caption = parseCaption(
      encode({
        speaker: "Ana",
        text: "bom dia",
        final: true,
        participantId: "user_1",
      }),
    );
    expect(caption).toEqual({
      speaker: "Ana",
      text: "bom dia",
      final: true,
      participantId: "user_1",
    });
  });

  it("defaults the speaker when the agent omits it", () => {
    expect(parseCaption(encode({ text: "olá" }))?.speaker).toBe("Participante");
  });

  it("marks partial frames as not final", () => {
    expect(parseCaption(encode({ text: "olá" }))?.final).toBe(false);
  });

  it("rejects frames without usable text", () => {
    expect(parseCaption(encode({ speaker: "Ana" }))).toBeNull();
    expect(parseCaption(encode({ speaker: "Ana", text: "   " }))).toBeNull();
    expect(parseCaption(encode({ text: 42 }))).toBeNull();
  });

  it("rejects malformed json instead of throwing", () => {
    expect(parseCaption(encode("{not json"))).toBeNull();
    expect(parseCaption(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
  });

  it("detects similar caption text", () => {
    expect(captionsSimilar("bom dia a todos", "bom dia a todos!")).toBe(true);
    expect(captionsSimilar("contrato", "café")).toBe(false);
  });
});
