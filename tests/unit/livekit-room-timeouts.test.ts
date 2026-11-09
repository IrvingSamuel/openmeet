// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRoom = vi.fn();
const listRooms = vi.fn();
const updateRoomMetadata = vi.fn();

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("livekit-server-sdk")>();
  return {
    ...actual,
    RoomServiceClient: vi.fn(function () {
      return { createRoom, listRooms, updateRoomMetadata };
    }),
  };
});

import { setRoomSpotlight, syncRoomMetadata } from "@/lib/livekit";

const meta = { meetingId: "m1", roomId: "r1", slug: "weekly" };

beforeEach(() => {
  process.env.LIVEKIT_API_KEY = "APItestkey";
  process.env.LIVEKIT_API_SECRET = "supersecretsupersecretsupersecret";
  process.env.LIVEKIT_URL = "ws://127.0.0.1:7880";
  delete process.env.LIVEKIT_EMPTY_TIMEOUT_SEC;
  createRoom.mockReset().mockResolvedValue({});
  listRooms.mockReset().mockResolvedValue([]);
  updateRoomMetadata.mockReset().mockResolvedValue({});
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

describe("room spotlight metadata", () => {
  const pin = { key: "ana:camera", by: "host_1", at: 1 };

  it("keeps an existing pin when a new participant joins", async () => {
    listRooms.mockResolvedValue([
      { metadata: JSON.stringify({ ...meta, spotlight: pin }) },
    ]);
    createRoom.mockRejectedValue(new Error("already exists"));
    await syncRoomMetadata("meet_weekly", meta, { dispatchAgent: false });

    const written = JSON.parse(updateRoomMetadata.mock.calls[0][1]);
    expect(written).toEqual({ ...meta, spotlight: pin });
    const created = JSON.parse(createRoom.mock.calls[0][0].metadata);
    expect(created.spotlight).toEqual(pin);
  });

  it("still creates the room when it does not exist yet", async () => {
    listRooms.mockRejectedValue(new Error("not found"));
    await syncRoomMetadata("meet_weekly", meta, { dispatchAgent: false });
    expect(JSON.parse(createRoom.mock.calls[0][0].metadata)).toEqual(meta);
  });

  it("merges the pin into the existing metadata", async () => {
    const features = { captions: true };
    listRooms.mockResolvedValue([
      { metadata: JSON.stringify({ ...meta, features }) },
    ]);
    await setRoomSpotlight("meet_weekly", pin);
    expect(updateRoomMetadata).toHaveBeenCalledWith(
      "meet_weekly",
      JSON.stringify({ ...meta, features, spotlight: pin }),
    );
  });

  it("clears the pin without dropping meeting metadata", async () => {
    listRooms.mockResolvedValue([
      { metadata: JSON.stringify({ ...meta, spotlight: pin }) },
    ]);
    await setRoomSpotlight("meet_weekly", null);
    expect(JSON.parse(updateRoomMetadata.mock.calls[0][1])).toEqual({
      ...meta,
      spotlight: null,
    });
  });
});
