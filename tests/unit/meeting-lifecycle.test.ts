// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateWhere = vi.fn();
const updateReturning = vi.fn();
const meetingsFindFirst = vi.fn();
const meetingsFindMany = vi.fn();
const participantsFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
        findMany: (...args: unknown[]) => meetingsFindMany(...args),
      },
      participants: {
        findFirst: (...args: unknown[]) => participantsFindFirst(...args),
      },
    },
    update: () => ({
      set: () => ({
        where: (...args: unknown[]) => {
          updateWhere(...args);
          return {
            returning: (...rArgs: unknown[]) => updateReturning(...rArgs),
          };
        },
      }),
    }),
  },
}));

import {
  activateMeetingIfScheduled,
  expireStaleMeetings,
  loadMeetingBySlugAfterExpiry,
  MEETING_EMPTY_TIMEOUT_SEC,
} from "@/lib/meeting-lifecycle";

beforeEach(() => {
  updateWhere.mockReset();
  updateReturning.mockReset();
  meetingsFindFirst.mockReset();
  meetingsFindMany.mockReset();
  participantsFindFirst.mockReset();
  updateReturning.mockResolvedValue([]);
  meetingsFindMany.mockResolvedValue([]);
  participantsFindFirst.mockResolvedValue(undefined);
});

describe("activateMeetingIfScheduled", () => {
  it("updates scheduled meetings to active", async () => {
    updateReturning.mockResolvedValue([{ id: "m1" }]);
    const ok = await activateMeetingIfScheduled("m1");
    expect(ok).toBe(true);
    expect(updateWhere).toHaveBeenCalled();
  });

  it("returns false when no row was scheduled", async () => {
    updateReturning.mockResolvedValue([]);
    const ok = await activateMeetingIfScheduled("m1");
    expect(ok).toBe(false);
  });
});

describe("expireStaleMeetings", () => {
  it("expires scheduled meetings older than the empty timeout", async () => {
    updateReturning.mockResolvedValueOnce([{ id: "old-scheduled" }]);
    meetingsFindMany.mockResolvedValue([]);

    const result = await expireStaleMeetings();
    expect(result.expiredScheduled).toEqual(["old-scheduled"]);
    expect(result.expiredOrphans).toEqual([]);
  });

  it("expires orphan active meetings without LiveKit SID or open participants", async () => {
    updateReturning
      .mockResolvedValueOnce([]) // scheduled batch
      .mockResolvedValueOnce([{ id: "orphan-1" }]); // orphan batch
    meetingsFindMany.mockResolvedValue([{ id: "orphan-1" }]);
    participantsFindFirst.mockResolvedValue(undefined);

    const result = await expireStaleMeetings();
    expect(result.expiredOrphans).toEqual(["orphan-1"]);
  });

  it("does not expire active orphans that still have an open participant", async () => {
    updateReturning.mockResolvedValueOnce([]);
    meetingsFindMany.mockResolvedValue([{ id: "active-1" }]);
    participantsFindFirst.mockResolvedValue({ id: "p1" });

    const result = await expireStaleMeetings();
    expect(result.expiredOrphans).toEqual([]);
    // only the scheduled update ran
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("scopes expiry to a single meeting when meetingId is provided", async () => {
    updateReturning.mockResolvedValueOnce([{ id: "m-scoped" }]);
    meetingsFindMany.mockResolvedValue([]);

    const result = await expireStaleMeetings({ meetingId: "m-scoped" });
    expect(result.expiredScheduled).toEqual(["m-scoped"]);
  });
});

describe("loadMeetingBySlugAfterExpiry", () => {
  it("returns null when missing", async () => {
    meetingsFindFirst.mockResolvedValue(undefined);
    await expect(loadMeetingBySlugAfterExpiry("nope")).resolves.toBeNull();
  });

  it("reloads after attempting expiry for scheduled meetings", async () => {
    const scheduled = {
      id: "m1",
      slug: "abc",
      status: "scheduled",
      startedAt: new Date(Date.now() - (MEETING_EMPTY_TIMEOUT_SEC + 5) * 1000),
    };
    const ended = { ...scheduled, status: "ended" };
    meetingsFindFirst
      .mockResolvedValueOnce(scheduled)
      .mockResolvedValueOnce(ended);
    updateReturning.mockResolvedValue([{ id: "m1" }]);
    meetingsFindMany.mockResolvedValue([]);

    const result = await loadMeetingBySlugAfterExpiry("abc");
    expect(result?.status).toBe("ended");
  });

  it("skips expiry for already ended meetings", async () => {
    meetingsFindFirst.mockResolvedValue({
      id: "m1",
      slug: "abc",
      status: "ended",
    });
    const result = await loadMeetingBySlugAfterExpiry("abc");
    expect(result?.status).toBe("ended");
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
