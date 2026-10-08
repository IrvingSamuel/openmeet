// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRoom = vi.fn();

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("livekit-server-sdk")>();
  return {
    ...actual,
    RoomServiceClient: vi.fn(function () {
      return { createRoom };
    }),
  };
});

import { syncRoomMetadata } from "@/lib/livekit";

const meta = { meetingId: "m1", roomId: "r1", slug: "weekly" };

beforeEach(() => {
  process.env.LIVEKIT_API_KEY = "APItestkey";
  process.env.LIVEKIT_API_SECRET = "supersecretsupersecretsupersecret";
  process.env.LIVEKIT_URL = "ws://127.0.0.1:7880";
  delete process.env.LIVEKIT_EMPTY_TIMEOUT_SEC;
  createRoom.mockResolvedValue({});
});

describe("syncRoomMetadata room timeouts", () => {
  it("keeps the room alive after the last participant leaves", async () => {
    await syncRoomMetadata("meet_weekly", meta, { dispatchAgent: false });
    expect(createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ emptyTimeout: 300, departureTimeout: 300 }),
    );
  });

  it("follows the meeting's own empty timeout", async () => {
    await syncRoomMetadata("meet_weekly", meta, {
      emptyTimeout: 900,
      dispatchAgent: false,
    });
    expect(createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ emptyTimeout: 900, departureTimeout: 900 }),
    );
  });
});
