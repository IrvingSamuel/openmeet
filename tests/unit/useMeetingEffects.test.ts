// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioOptionsFromPrefs,
  canUseBackgroundEffects,
  useMeetingEffects,
  videoOptionsForEffect,
} from "@/hooks/useMeetingEffects";
import { DEFAULT_MEDIA_PREFS } from "@/lib/media-prefs-schema";
import { VideoPresets } from "livekit-client";

const switchTo = vi.fn().mockResolvedValue(undefined);
const setProcessor = vi.fn().mockResolvedValue(undefined);
const stopProcessor = vi.fn().mockResolvedValue(undefined);
const getProcessor = vi.fn().mockReturnValue(null);
const setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
const setCameraEnabled = vi.fn().mockResolvedValue(undefined);
const BackgroundProcessorMock = vi.fn(() => ({ switchTo }));

vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: () => true,
  BackgroundProcessor: (opts: unknown) => BackgroundProcessorMock(opts),
}));

const detectPerformanceProfile = vi.fn(() => "high" as const);

vi.mock("@/lib/device-capability", () => ({
  detectPerformanceProfile: () => detectPerformanceProfile(),
}));

function makeCameraTrack() {
  return {
    isMuted: false,
    setProcessor,
    stopProcessor,
    getProcessor,
  };
}

function makeRoom(opts?: { micOn?: boolean; camOn?: boolean; track?: ReturnType<typeof makeCameraTrack> | null }) {
  const micOn = opts?.micOn ?? true;
  const camOn = opts?.camOn ?? true;
  const track = opts?.track === undefined ? makeCameraTrack() : opts.track;
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  return {
    localParticipant: {
      isMicrophoneEnabled: micOn,
      isCameraEnabled: camOn,
      getTrackPublication: () =>
        track ? { track, source: "camera" } : undefined,
      setMicrophoneEnabled,
      setCameraEnabled,
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
    detectPerformanceProfile.mockReturnValue("high");
    getProcessor.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports background processor support", () => {
    expect(canUseBackgroundEffects()).toBe(true);
  });

  it("does not republish mic on default prefs hydrate (preserves captions audio)", async () => {
    const room = makeRoom({ camOn: false });
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
    const room = makeRoom({ camOn: false });
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

  it("on high profile keeps full quality when enabling virtual background", async () => {
    detectPerformanceProfile.mockReturnValue("high");
    const room = makeRoom({ camOn: true });
    const { rerender } = renderHook(
      ({ prefs }) =>
        useMeetingEffects(
          room as unknown as import("livekit-client").Room,
          prefs,
        ),
      { initialProps: { prefs: { ...DEFAULT_MEDIA_PREFS } } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      rerender({
        prefs: {
          ...DEFAULT_MEDIA_PREFS,
          videoEffect: "virtual",
          virtualBackgroundUrl: "/virtual-backgrounds/office.jpg",
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setCameraEnabled).not.toHaveBeenCalled();
    expect(BackgroundProcessorMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "disabled" }),
    );
    expect(BackgroundProcessorMock.mock.calls[0][0]).not.toHaveProperty(
      "maxFps",
    );
    expect(switchTo).toHaveBeenCalledWith({
      mode: "virtual-background",
      imagePath: "/virtual-backgrounds/office.jpg",
    });
  });

  it("on low profile lowers capture and caps processor FPS for virtual background", async () => {
    detectPerformanceProfile.mockReturnValue("low");
    const room = makeRoom({ camOn: true });
    const { rerender } = renderHook(
      ({ prefs }) =>
        useMeetingEffects(
          room as unknown as import("livekit-client").Room,
          prefs,
        ),
      { initialProps: { prefs: { ...DEFAULT_MEDIA_PREFS } } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      rerender({
        prefs: {
          ...DEFAULT_MEDIA_PREFS,
          videoEffect: "virtual",
          virtualBackgroundUrl: "/virtual-backgrounds/office.jpg",
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setCameraEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        resolution: VideoPresets.h360.resolution,
        frameRate: 15,
      }),
    );
    expect(BackgroundProcessorMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "disabled", maxFps: 15 }),
    );
    expect(switchTo).toHaveBeenCalledWith({
      mode: "virtual-background",
      imagePath: "/virtual-backgrounds/office.jpg",
    });
  });

  it("detaches processor when effect returns to none", async () => {
    detectPerformanceProfile.mockReturnValue("high");
    const track = makeCameraTrack();
    const room = makeRoom({ camOn: true, track });
    const { rerender } = renderHook(
      ({ prefs }) =>
        useMeetingEffects(
          room as unknown as import("livekit-client").Room,
          prefs,
        ),
      {
        initialProps: {
          prefs: {
            ...DEFAULT_MEDIA_PREFS,
            videoEffect: "virtual" as const,
            virtualBackgroundUrl: "/virtual-backgrounds/office.jpg",
          },
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(switchTo).toHaveBeenCalled();

    await act(async () => {
      rerender({ prefs: { ...DEFAULT_MEDIA_PREFS, videoEffect: "none" } });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stopProcessor).toHaveBeenCalled();
  });
});

describe("videoOptionsForEffect", () => {
  it("returns device-only opts on high profile with effect", () => {
    expect(videoOptionsForEffect("virtual", "cam-1", "high")).toEqual({
      deviceId: "cam-1",
    });
  });

  it("returns 360p@15 on low profile with effect", () => {
    expect(videoOptionsForEffect("blur", "cam-1", "low")).toEqual({
      deviceId: "cam-1",
      resolution: VideoPresets.h360.resolution,
      frameRate: 15,
    });
  });

  it("does not cap resolution on low profile when effect is none", () => {
    expect(videoOptionsForEffect("none", "cam-1", "low")).toEqual({
      deviceId: "cam-1",
    });
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
