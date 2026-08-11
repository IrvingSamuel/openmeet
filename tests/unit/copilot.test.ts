import { describe, expect, it } from "vitest";
import { parseInsights } from "@/lib/captions";

describe("parseInsights", () => {
  it("flattens insight batches", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        insights: ["ponto A"],
        observations: ["obs"],
        suggestions: ["faça X"],
        at: 123,
      }),
    );
    expect(parseInsights(payload)).toEqual([
      { kind: "insight", text: "ponto A", at: 123 },
      { kind: "observation", text: "obs", at: 123 },
      { kind: "suggestion", text: "faça X", at: 123 },
    ]);
  });

  it("tolerates bad frames", () => {
    expect(parseInsights(new TextEncoder().encode("{"))).toEqual([]);
  });
});
