// @vitest-environment node
import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const meetingsFindFirst = vi.fn();
const setHostEntryGrant = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/lib/host-entry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/host-entry")>(
    "@/lib/host-entry",
  );
  return {
    ...actual,
    setHostEntryGrant: (...args: unknown[]) => setHostEntryGrant(...args),
  };
});

import { NextRequest } from "next/server";
import { GET as enterHost } from "@/app/api/v1/meetings/[meeting_id]/enter/route";
import {
  generateHostEntryToken,
  hashHostEntryToken,
  parseRedirectAfterMeet,
  verifyHostEntryToken,
} from "@/lib/host-entry";

function getRequest(url: string) {
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  meetingsFindFirst.mockReset();
  setHostEntryGrant.mockReset();
  setHostEntryGrant.mockResolvedValue(undefined);
  process.env.NEXT_PUBLIC_APP_URL = "https://openmeet.chronos.com.pt";
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || "x".repeat(32) + "test-session-secret-ok";
});

describe("host-entry helpers", () => {
  it("hashes and verifies tokens", () => {
    const token = generateHostEntryToken();
    const hash = hashHostEntryToken(token);
    expect(hash).toHaveLength(64);
    expect(verifyHostEntryToken(token, hash)).toBe(true);
    expect(verifyHostEntryToken("wrong", hash)).toBe(false);
  });

  it("parses absolute http(s) redirect URLs", () => {
    expect(parseRedirectAfterMeet("https://lms.example.com/x")).toBe(
      "https://lms.example.com/x",
    );
    expect(parseRedirectAfterMeet(null)).toBeNull();
    expect(() => parseRedirectAfterMeet("/relative")).toThrow(
      "redirect_after_meet_invalid",
    );
    expect(() => parseRedirectAfterMeet("javascript:alert(1)")).toThrow(
      "redirect_after_meet_invalid",
    );
  });
});

describe("GET /api/v1/meetings/{id}/enter", () => {
  const meetingId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("rejects invalid token", async () => {
    const token = generateHostEntryToken();
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      slug: "abc",
      status: "scheduled",
      hostEntryTokenHash: hashHostEntryToken(token),
    });

    const res = await enterHost(
      getRequest(
        `http://localhost/api/v1/meetings/${meetingId}/enter?token=bad`,
      ),
      { params: Promise.resolve({ meeting_id: meetingId }) },
    );
    expect(res.status).toBe(403);
  });

  it("sets host grant and redirects on valid token", async () => {
    const token = generateHostEntryToken();
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      slug: "abc123",
      status: "scheduled",
      hostEntryTokenHash: hashHostEntryToken(token),
    });

    const res = await enterHost(
      getRequest(
        `http://localhost:3332/api/v1/meetings/${meetingId}/enter?token=${encodeURIComponent(token)}&display_name=Teacher`,
      ),
      { params: Promise.resolve({ meeting_id: meetingId }) },
    );
    expect(res.status).toBe(302);
    expect(setHostEntryGrant).toHaveBeenCalledWith({
      meetingId,
      displayName: "Teacher",
    });
    const location = res.headers.get("location") || "";
    expect(location).toBe("https://openmeet.chronos.com.pt/pt/m/abc123");
    expect(location).not.toContain("localhost");
  });

  it("redirect Location uses NEXT_PUBLIC_APP_URL, not request origin", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ismeet.stepone.com.br";
    const token = generateHostEntryToken();
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      slug: "hostslug",
      status: "live",
      hostEntryTokenHash: hashHostEntryToken(token),
    });

    const res = await enterHost(
      getRequest(
        `http://127.0.0.1:3332/api/v1/meetings/${meetingId}/enter?token=${encodeURIComponent(token)}`,
      ),
      { params: Promise.resolve({ meeting_id: meetingId }) },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://ismeet.stepone.com.br/pt/m/hostslug",
    );
  });

  it("rejects ended meetings", async () => {
    const token = generateHostEntryToken();
    meetingsFindFirst.mockResolvedValue({
      id: meetingId,
      slug: "abc",
      status: "ended",
      hostEntryTokenHash: createHash("sha256").update(token).digest("hex"),
    });

    const res = await enterHost(
      getRequest(
        `http://localhost/api/v1/meetings/${meetingId}/enter?token=${encodeURIComponent(token)}`,
      ),
      { params: Promise.resolve({ meeting_id: meetingId }) },
    );
    expect(res.status).toBe(410);
  });
});
