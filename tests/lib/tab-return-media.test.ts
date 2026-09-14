import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB_RETURN_MEDIA_POLICY,
  normalizeTabReturnEnabled,
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

describe("normalizeTabReturnEnabled", () => {
  it("defaults to on when unset", () => {
    expect(normalizeTabReturnEnabled(undefined)).toBe(true);
    expect(normalizeTabReturnEnabled(null)).toBe(true);
    expect(normalizeTabReturnEnabled(true)).toBe(true);
  });

  it("accepts explicit off", () => {
    expect(normalizeTabReturnEnabled(false)).toBe(false);
  });
});
