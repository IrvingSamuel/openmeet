// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioOptionsFromPrefs,
  canUseBackgroundEffects,
  useMeetingEffects,
} from "@/hooks/useMeetingEffects";
import { DEFAULT_MEDIA_PREFS } from "@/lib/media-prefs-schema";

const switchTo = vi.fn().mockResolvedValue(undefined);
const setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);

vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: () => true,
  BackgroundProcessor: () => ({ switchTo }),
}));

function makeRoom(micOn = true) {
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  return {
    localParticipant: {
      isMicrophoneEnabled: micOn,
      getTrackPublication: () => undefined,
      setMicrophoneEnabled,
    },
    getActiveDevice: () => "mic-1",
    on: (event: string, cb: (...a: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off: (event: string, cb: (...a: unknown[]) => void) => {
      listeners.get(event)?.delete(cb);
    },
  };
}

describe("useMeetingEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports background processor support", () => {
    expect(canUseBackgroundEffects()).toBe(true);
  });

  it("does not republish mic on default prefs hydrate (preserves captions audio)", async () => {
    const room = makeRoom(true);
    renderHook(() =>
      useMeetingEffects(
        room as unknown as import("livekit-client").Room,
        { ...DEFAULT_MEDIA_PREFS },
      ),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it("restarts mic when audio constraints actually change", async () => {
    const room = makeRoom(true);
    const { rerender } = renderHook(
      ({ prefs }) =>
        useMeetingEffects(
          room as unknown as import("livekit-client").Room,
          prefs,
        ),
      {
        initialProps: {
          prefs: { ...DEFAULT_MEDIA_PREFS },
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(setMicrophoneEnabled).not.toHaveBeenCalled();

    await act(async () => {
      rerender({
        prefs: { ...DEFAULT_MEDIA_PREFS, noiseSuppression: false },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        noiseSuppression: false,
        echoCancellation: true,
        autoGainControl: true,
        deviceId: "mic-1",
      }),
    );
  });
});

describe("audioOptionsFromPrefs", () => {
  it("merges device id with constraint flags", () => {
    expect(
      audioOptionsFromPrefs(
        { ...DEFAULT_MEDIA_PREFS, noiseSuppression: false },
        "dev-1",
      ),
    ).toEqual({
      deviceId: "dev-1",
      noiseSuppression: false,
      echoCancellation: true,
      autoGainControl: true,
    });
  });
});
