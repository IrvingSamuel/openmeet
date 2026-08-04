import { describe, expect, it } from "vitest";
import {
  extractBoardMembers,
  resolveAssigneeIds,
} from "@/lib/chronos-mcp";
import { parseInsights } from "@/lib/captions";

describe("resolveAssigneeIds", () => {
  const members = [
    { id: 1, name: "Ana Silva", email: "ana@corp.pt" },
    { id: 2, name: "Caio", email: "caio@corp.pt" },
  ];

  it("matches exact name", () => {
    expect(resolveAssigneeIds(members, "Ana Silva")).toEqual([1]);
  });

  it("matches partial name", () => {
    expect(resolveAssigneeIds(members, "Ana")).toEqual([1]);
  });

  it("returns empty when no hint", () => {
    expect(resolveAssigneeIds(members, null)).toEqual([]);
    expect(resolveAssigneeIds(members, "  ")).toEqual([]);
  });
});

describe("extractBoardMembers", () => {
  it("reads nested user objects", () => {
    expect(
      extractBoardMembers({
        members: [{ user: { id: 9, name: "Lia", email: "l@x.pt" } }],
      }),
    ).toEqual([{ id: 9, name: "Lia", email: "l@x.pt" }]);
  });
});

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
