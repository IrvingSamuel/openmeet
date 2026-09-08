import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReactionBurstOverlay } from "@/components/room/ReactionBurstOverlay";
import { burstFromEvent } from "@/lib/room-reactions";

describe("ReactionBurstOverlay", () => {
  it("renders without crashing with bursts", () => {
    const event = {
      id: "burst-1",
      emoji: "👍",
      displayName: "Test",
      identity: "t",
      at: Date.now(),
    };
    const bursts = [burstFromEvent(event)];
    const { container } = render(<ReactionBurstOverlay bursts={bursts} />);
    expect(container.textContent).toContain("👍");
    expect(container.textContent).toContain("Test");
  });

  it("renders empty", () => {
    const { container } = render(<ReactionBurstOverlay bursts={[]} />);
    expect(container.querySelector("[aria-hidden]")).toBeTruthy();
  });
});
