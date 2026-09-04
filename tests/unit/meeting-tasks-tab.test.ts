// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeActionItemStatus } from "@/components/summary/MeetingTasksTab";

describe("normalizeActionItemStatus", () => {
  it("maps pending and unknown values to pending", () => {
    expect(normalizeActionItemStatus("pending")).toBe("pending");
    expect(normalizeActionItemStatus("")).toBe("pending");
  });

  it("maps done and legacy created to done", () => {
    expect(normalizeActionItemStatus("done")).toBe("done");
    expect(normalizeActionItemStatus("created")).toBe("done");
  });
});
