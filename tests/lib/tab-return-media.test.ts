import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB_RETURN_MEDIA_POLICY,
  normalizeTabReturnMediaPolicy,
} from "@/lib/tab-return-media";

describe("normalizeTabReturnMediaPolicy", () => {
  it("defaults to closed", () => {
    expect(normalizeTabReturnMediaPolicy(undefined)).toBe(
      DEFAULT_TAB_RETURN_MEDIA_POLICY,
    );
    expect(normalizeTabReturnMediaPolicy("")).toBe("closed");
    expect(normalizeTabReturnMediaPolicy("nope")).toBe("closed");
  });

  it("accepts open, closed, restore", () => {
    expect(normalizeTabReturnMediaPolicy("open")).toBe("open");
    expect(normalizeTabReturnMediaPolicy("CLOSED")).toBe("closed");
    expect(normalizeTabReturnMediaPolicy(" restore ")).toBe("restore");
  });
});
