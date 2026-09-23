// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModerateParticipant } from "@/hooks/useModerateParticipant";

const toast = {
  push: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
};

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => toast,
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

describe("useModerateParticipant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs mute with identity and meetingId", async () => {
    const { result } = renderHook(() =>
      useModerateParticipant({
        roomSlug: "demo-room",
        meetingId: "mtg-1",
      }),
    );

    await act(async () => {
      const ok = await result.current.moderate("user-42", "mute");
      expect(ok).toBe(true);
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/meetings/by-slug/demo-room/moderate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "mute",
          identity: "user-42",
          meetingId: "mtg-1",
        }),
      }),
    );
    expect(toast.push).toHaveBeenCalledWith("common.toast.micMuted");
  });

  it("POSTs camera_off", async () => {
    const { result } = renderHook(() =>
      useModerateParticipant({ roomSlug: "demo-room" }),
    );

    await act(async () => {
      await result.current.moderate("user-7", "camera_off");
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/meetings/by-slug/demo-room/moderate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "camera_off",
          identity: "user-7",
          meetingId: undefined,
        }),
      }),
    );
    expect(toast.push).toHaveBeenCalledWith("common.toast.cameraOff");
  });

  it("does nothing when disabled or roomSlug missing", async () => {
    const { result } = renderHook(() =>
      useModerateParticipant({ enabled: false, roomSlug: "x" }),
    );
    await act(async () => {
      expect(await result.current.moderate("a", "mute")).toBe(false);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
