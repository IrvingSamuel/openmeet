// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_ACCESS,
  keysMatch,
  normalizePageAccessSettings,
  pageAccessCookieValue,
  resolveAccessRedirect,
  verifyPageAccessCookie,
} from "@/lib/page-access";

describe("normalizePageAccessSettings", () => {
  it("returns defaults for empty input", () => {
    expect(normalizePageAccessSettings(undefined)).toEqual(DEFAULT_PAGE_ACCESS);
    expect(normalizePageAccessSettings(null)).toEqual(DEFAULT_PAGE_ACCESS);
  });

  it("merges partial pages and trims request key", () => {
    const normalized = normalizePageAccessSettings({
      requestKey: "  secret  ",
      pages: {
        home: { enabled: false, redirectTo: "/unlock" },
      },
    });
    expect(normalized.requestKey).toBe("secret");
    expect(normalized.pages.home).toEqual({
      enabled: false,
      redirectTo: "/unlock",
    });
    expect(normalized.pages.dashboard.enabled).toBe(true);
    expect(normalized.pages.settings.redirectTo).toBe("/login");
  });
});

describe("resolveAccessRedirect", () => {
  it("prefixes locale for relative paths", () => {
    expect(resolveAccessRedirect("/login", "pt")).toBe("/pt/login");
    expect(resolveAccessRedirect("unlock", "en")).toBe("/en/unlock");
  });

  it("keeps absolute URLs and already-localized paths", () => {
    expect(resolveAccessRedirect("https://example.com/x", "pt")).toBe(
      "https://example.com/x",
    );
    expect(resolveAccessRedirect("/pt/login", "pt")).toBe("/pt/login");
  });
});

describe("page access cookie", () => {
  it("verifies matching HMAC cookie", () => {
    const key = "test-request-key";
    const cookie = pageAccessCookieValue(key);
    expect(verifyPageAccessCookie(cookie, key)).toBe(true);
    expect(verifyPageAccessCookie(cookie, "other")).toBe(false);
    expect(verifyPageAccessCookie(undefined, key)).toBe(false);
    expect(verifyPageAccessCookie(cookie, null)).toBe(false);
  });

  it("compares keys in constant time shape", () => {
    expect(keysMatch("abc", "abc")).toBe(true);
    expect(keysMatch("abc", "abd")).toBe(false);
    expect(keysMatch("abc", null)).toBe(false);
  });
});
