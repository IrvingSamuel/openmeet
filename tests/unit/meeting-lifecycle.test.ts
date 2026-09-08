// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateWhere = vi.fn();
const updateReturning = vi.fn();
const meetingsFindFirst = vi.fn();
const meetingsFindMany = vi.fn();
const selectDistinctWhere = vi.fn();
const selectDistinctResult = vi.fn<() => Promise<{ meetingId: string }[]>>();
const listRooms = vi.fn();
const deleteRoom = vi.fn();

vi.mock("@/lib/livekit", () => ({
  getRoomServiceClient: () => ({
    listRooms,
    deleteRoom,
  }),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
        findMany: (...args: unknown[]) => meetingsFindMany(...args),
      },
    },
    selectDistinct: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          selectDistinctWhere(...args);
          return selectDistinctResult();
        },
      }),
    }),
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
  DEFAULT_SCHEDULED_MAX_AGE_SEC,
  expireStaleMeetings,
  getMeetingEmptyTimeoutSec,
  loadMeetingBySlugAfterExpiry,
  MEETING_EMPTY_TIMEOUT_SEC,
  reconcileActiveMeetingsWithLiveKit,
  reconcileAndExpireMeetings,
} from "@/lib/meeting-lifecycle";

beforeEach(() => {
  updateWhere.mockReset();
  updateReturning.mockReset();
  meetingsFindFirst.mockReset();
  meetingsFindMany.mockReset();
  selectDistinctWhere.mockReset();
  selectDistinctResult.mockReset();
  listRooms.mockReset();
  deleteRoom.mockReset();
  updateReturning.mockResolvedValue([]);
  meetingsFindMany.mockResolvedValue([]);
  selectDistinctResult.mockResolvedValue([]);
  listRooms.mockResolvedValue([]);
  deleteRoom.mockResolvedValue(undefined);
  delete process.env.MEETING_EMPTY_TIMEOUT_SEC;
  delete process.env.LIVEKIT_EMPTY_TIMEOUT_SEC;
  delete process.env.MEETING_SCHEDULED_MAX_AGE_SEC;
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
  it("expires scheduled meetings older than the scheduled max age", async () => {
    updateReturning.mockResolvedValueOnce([{ id: "old-scheduled" }]);
    meetingsFindMany.mockResolvedValue([]);

    const result = await expireStaleMeetings();
    expect(result.expiredScheduled).toEqual(["old-scheduled"]);
    expect(result.expiredOrphans).toEqual([]);
  });

  it("does not use empty timeout for scheduled max-age cutoff", () => {
    expect(DEFAULT_SCHEDULED_MAX_AGE_SEC).toBeGreaterThan(
      MEETING_EMPTY_TIMEOUT_SEC,
    );
    expect(getMeetingEmptyTimeoutSec()).toBe(MEETING_EMPTY_TIMEOUT_SEC);
  });

  it("expires orphan active meetings without LiveKit SID or open participants", async () => {
    updateReturning
      .mockResolvedValueOnce([]) // scheduled batch
      .mockResolvedValueOnce([{ id: "orphan-1" }]); // orphan batch
    meetingsFindMany.mockResolvedValue([{ id: "orphan-1" }]);

    const result = await expireStaleMeetings();
    expect(result.expiredOrphans).toEqual(["orphan-1"]);
  });

  it("does not expire active orphans that still have an open participant", async () => {
    updateReturning.mockResolvedValueOnce([]);
    meetingsFindMany.mockResolvedValue([{ id: "active-1" }]);
    selectDistinctResult.mockResolvedValueOnce([{ meetingId: "active-1" }]);

    const result = await expireStaleMeetings();
    expect(result.expiredOrphans).toEqual([]);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("scopes expiry to a single meeting when meetingId is provided", async () => {
    updateReturning.mockResolvedValueOnce([{ id: "m-scoped" }]);
    meetingsFindMany.mockResolvedValue([]);

    const result = await expireStaleMeetings({ meetingId: "m-scoped" });
    expect(result.expiredScheduled).toEqual(["m-scoped"]);
  });
});

describe("reconcileActiveMeetingsWithLiveKit", () => {
  it("ends active meetings whose LiveKit room is gone", async () => {
    meetingsFindMany.mockResolvedValue([
      { id: "m1", livekitRoomName: "meet_abc" },
    ]);
    listRooms.mockResolvedValue([]);
    updateReturning.mockResolvedValueOnce([{ id: "m1" }]);

    const result = await reconcileActiveMeetingsWithLiveKit();
    expect(result.expiredAbandoned).toEqual(["m1"]);
  });

  it("deletes empty LiveKit rooms and ends the meeting", async () => {
    meetingsFindMany.mockResolvedValue([
      { id: "m2", livekitRoomName: "meet_xyz" },
    ]);
    listRooms.mockResolvedValue([{ name: "meet_xyz", numParticipants: 0 }]);
    updateReturning.mockResolvedValueOnce([{ id: "m2" }]);

    const result = await reconcileActiveMeetingsWithLiveKit();
    expect(result.expiredAbandoned).toEqual(["m2"]);
    expect(deleteRoom).toHaveBeenCalledWith("meet_xyz");
  });

  it("skips meetings that still have LiveKit participants", async () => {
    meetingsFindMany.mockResolvedValue([
      { id: "m3", livekitRoomName: "meet_live" },
    ]);
    listRooms.mockResolvedValue([{ name: "meet_live", numParticipants: 2 }]);

    const result = await reconcileActiveMeetingsWithLiveKit();
    expect(result.expiredAbandoned).toEqual([]);
    expect(updateWhere).not.toHaveBeenCalled();
  });
});

describe("reconcileAndExpireMeetings", () => {
  it("combines stale expiry and LiveKit reconciliation", async () => {
    updateReturning
      .mockResolvedValueOnce([{ id: "scheduled-1" }])
      .mockResolvedValueOnce([{ id: "orphan-1" }])
      .mockResolvedValueOnce([{ id: "abandoned-1" }]);
    meetingsFindMany
      .mockResolvedValueOnce([{ id: "orphan-1" }])
      .mockResolvedValueOnce([
        { id: "abandoned-1", livekitRoomName: "meet_a" },
      ]);
    listRooms.mockResolvedValue([]);

    const result = await reconcileAndExpireMeetings();
    expect(result.expiredScheduled).toEqual(["scheduled-1"]);
    expect(result.expiredOrphans).toEqual(["orphan-1"]);
    expect(result.expiredAbandoned).toEqual(["abandoned-1"]);
  });
});

describe("loadMeetingBySlugAfterExpiry", () => {
  it("returns null when missing", async () => {
    meetingsFindFirst.mockResolvedValue(undefined);
    await expect(loadMeetingBySlugAfterExpiry("nope")).resolves.toBeNull();
  });

  it("reloads after attempting expiry for old scheduled meetings", async () => {
    const scheduled = {
      id: "m1",
      slug: "abc",
      status: "scheduled",
      startedAt: new Date(
        Date.now() - (DEFAULT_SCHEDULED_MAX_AGE_SEC + 5) * 1000,
      ),
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
