// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomEvent } from "livekit-client";
import {
  resolveCaptureDeviceId,
  useMeetingDevices,
} from "@/hooks/useMeetingDevices";

function makeDevice(
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: "g1",
    toJSON() {
      return this;
    },
  } as MediaDeviceInfo;
}

const devices = [
  makeDevice("audioinput", "mic-1", "Yeti"),
  makeDevice("audioinput", "mic-2", "Built-in"),
  makeDevice("videoinput", "cam-1", "Logitech"),
  makeDevice("audiooutput", "spk-1", "Headphones"),
];

function makeRoom() {
  const active: Record<string, string> = {
    audioinput: "mic-1",
    videoinput: "cam-1",
    audiooutput: "spk-1",
  };
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    getActiveDevice: vi.fn((kind: MediaDeviceKind) => active[kind]),
    switchActiveDevice: vi.fn(async (kind: MediaDeviceKind, deviceId: string) => {
      active[kind] = deviceId;
      const set = listeners.get(RoomEvent.ActiveDeviceChanged);
      set?.forEach((fn) => fn(kind, deviceId));
      return true;
    }),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(cb);
    }),
    _active: active,
  };
}

describe("useMeetingDevices", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue(devices),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enumerates devices and exposes active ids", async () => {
    const room = makeRoom();
    const { result } = renderHook(() =>
      useMeetingDevices(room as unknown as import("livekit-client").Room),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.devices.mics).toHaveLength(2);
    expect(result.current.devices.cameras).toHaveLength(1);
    expect(result.current.devices.speakers).toHaveLength(1);
    expect(result.current.active.micId).toBe("mic-1");
    expect(result.current.active.cameraId).toBe("cam-1");
  });

  it("switches microphone via room.switchActiveDevice", async () => {
    const room = makeRoom();
    const { result } = renderHook(() =>
      useMeetingDevices(room as unknown as import("livekit-client").Room),
    );

    await act(async () => {
      await result.current.switchMic("mic-2");
    });

    expect(room.switchActiveDevice).toHaveBeenCalledWith(
      "audioinput",
      "mic-2",
    );
    expect(result.current.active.micId).toBe("mic-2");
  });

  it("switches camera via room.switchActiveDevice", async () => {
    const room = makeRoom();
    const { result } = renderHook(() =>
      useMeetingDevices(room as unknown as import("livekit-client").Room),
    );

    await act(async () => {
      await result.current.switchCamera("cam-1");
    });

    expect(room.switchActiveDevice).toHaveBeenCalledWith(
      "videoinput",
      "cam-1",
    );
  });
});

describe("resolveCaptureDeviceId", () => {
  it("prefers the active LiveKit device over the lobby fallback", () => {
    const room = {
      getActiveDevice: (kind: MediaDeviceKind) =>
        kind === "audioinput" ? "active-mic" : undefined,
    };
    expect(
      resolveCaptureDeviceId(
        room as unknown as import("livekit-client").Room,
        "audioinput",
        "lobby-mic",
      ),
    ).toBe("active-mic");
  });

  it("falls back to the lobby device id when none is active", () => {
    const room = {
      getActiveDevice: () => undefined,
    };
    expect(
      resolveCaptureDeviceId(
        room as unknown as import("livekit-client").Room,
        "videoinput",
        "lobby-cam",
      ),
    ).toBe("lobby-cam");
  });
});
