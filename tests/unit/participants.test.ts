import { describe, expect, it } from "vitest";
import { isAgentParticipant } from "@/lib/participants";

describe("isAgentParticipant", () => {
  it("detects agent identity prefixes", () => {
    expect(isAgentParticipant({ identity: "agent-AJ_jeDJqSHYigvR" })).toBe(
      true,
    );
    expect(isAgentParticipant({ identity: "agent_copilot" })).toBe(true);
  });

  it("detects isAgent flag", () => {
    expect(
      isAgentParticipant({ identity: "copilot", isAgent: true }),
    ).toBe(true);
  });

  it("keeps human participants", () => {
    expect(isAgentParticipant({ identity: "Irving" })).toBe(false);
    expect(isAgentParticipant({ identity: "user-123", isAgent: false })).toBe(
      false,
    );
  });
});
