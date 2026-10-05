import { describe, expect, it, vi } from "vitest";
import { Room } from "livekit-client";
import { detachFreezeDisconnect } from "@/lib/livekit-freeze-guard";

function fakeRoomWithSdkFreezeListener() {
  const disconnect = vi.fn();
  const room = { onPageLeave: () => disconnect() };
  window.addEventListener("freeze", room.onPageLeave);
  return { room: room as unknown as Room, disconnect };
}

describe("detachFreezeDisconnect", () => {
  it("stops a Chrome freeze event from disconnecting the room", () => {
    const { room, disconnect } = fakeRoomWithSdkFreezeListener();

    expect(detachFreezeDisconnect(room)).toBe(true);
    window.dispatchEvent(new Event("freeze"));

    expect(disconnect).not.toHaveBeenCalled();
  });

  it("would disconnect without the guard (sanity check of the fake)", () => {
    const { room, disconnect } = fakeRoomWithSdkFreezeListener();

    window.dispatchEvent(new Event("freeze"));

    expect(disconnect).toHaveBeenCalledTimes(1);
    detachFreezeDisconnect(room);
  });

  it("is a no-op when the SDK no longer exposes onPageLeave", () => {
    expect(detachFreezeDisconnect({} as unknown as Room)).toBe(false);
  });

  it("still finds onPageLeave on the installed livekit-client Room", () => {
    const room = new Room();
    expect(
      typeof (room as unknown as { onPageLeave?: unknown }).onPageLeave,
    ).toBe("function");
  });
});
