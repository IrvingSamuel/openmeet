import { describe, expect, it, vi, afterEach } from "vitest";
import {
  cn,
  formatDuration,
  hueFromString,
  initials,
  readableOn,
  timeAgo,
} from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting tailwind classes keeping the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initials("Ana Paula Ribeiro")).toBe("AR");
  });

  it("uses two letters for a single name", () => {
    expect(initials("Caio")).toBe("CA");
  });

  it("falls back to a placeholder", () => {
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("readableOn", () => {
  it("picks black text over light brand colors", () => {
    expect(readableOn("#ffffff")).toBe("#000000");
    expect(readableOn("#fde047")).toBe("#000000");
  });

  it("picks white text over dark brand colors", () => {
    expect(readableOn("#0b1020")).toBe("#ffffff");
    expect(readableOn("#6366f1")).toBe("#ffffff");
  });

  it("expands shorthand hex", () => {
    expect(readableOn("#fff")).toBe("#000000");
  });

  it("defaults to white for malformed input", () => {
    expect(readableOn("nope")).toBe("#ffffff");
  });
});

describe("hueFromString", () => {
  it("is deterministic", () => {
    expect(hueFromString("ana")).toBe(hueFromString("ana"));
  });

  it("stays inside the hue range", () => {
    for (const value of ["a", "participante-1", "🙂", ""]) {
      const hue = hueFromString(value);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65_000)).toBe("01:05");
  });

  it("adds the hour segment past 60 minutes", () => {
    expect(formatDuration(3_725_000)).toBe("01:02:05");
  });

  it("guards against invalid input", () => {
    expect(formatDuration(-1)).toBe("00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00");
  });
});

const ptTimeAgo = {
  justNow: "agora",
  minutes: (n: number) => `${n} minuto${n === 1 ? "" : "s"} atrás`,
  hours: (n: number) => `${n} hora${n === 1 ? "" : "s"} atrás`,
  days: (n: number) => `${n} dia${n === 1 ? "" : "s"} atrás`,
  months: (n: number) => `${n} ${n === 1 ? "mês" : "meses"} atrás`,
  years: (n: number) => `${n} ano${n === 1 ? "" : "s"} atrás`,
};

describe("timeAgo", () => {
  afterEach(() => vi.useRealTimers());

  it("collapses anything under a minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(timeAgo("2026-01-01T11:59:30Z", ptTimeAgo)).toBe("agora");
  });

  it("uses singular and plural correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(timeAgo("2026-01-01T11:00:00Z", ptTimeAgo)).toBe("1 hora atrás");
    expect(timeAgo("2026-01-01T09:00:00Z", ptTimeAgo)).toBe("3 horas atrás");
    expect(timeAgo("2025-12-30T12:00:00Z", ptTimeAgo)).toBe("2 dias atrás");
  });

  it("returns an empty string for invalid dates", () => {
    expect(timeAgo("not-a-date", ptTimeAgo)).toBe("");
  });
});
