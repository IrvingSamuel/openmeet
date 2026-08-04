import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "@/lib/safe-return-to";

describe("sanitizeReturnTo", () => {
  it("accepts relative paths", () => {
    expect(sanitizeReturnTo("/r/abc123")).toBe("/r/abc123");
    expect(sanitizeReturnTo("/dashboard")).toBe("/dashboard");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizeReturnTo("https://evil.example/")).toBeNull();
    expect(sanitizeReturnTo("//evil.example/")).toBeNull();
    expect(sanitizeReturnTo("http://meet.chronos.com.pt/r/x")).toBeNull();
  });

  it("rejects empty and non-path values", () => {
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo("r/abc")).toBeNull();
  });
});
