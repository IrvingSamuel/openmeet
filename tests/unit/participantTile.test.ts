import { describe, expect, it } from "vitest";
import { shouldRenderVideoTrack } from "@/lib/videoTrack";

describe("shouldRenderVideoTrack", () => {
  it("renders once we have a real track reference that is not muted", () => {
    expect(
      shouldRenderVideoTrack({ isTrackReference: true, isMuted: false }),
    ).toBe(true);
  });

  it("does not require publication.track to be present", () => {
    // adaptiveStream only starts after a <video> mounts — gating on track
    // would leave remote video permanently blank.
    expect(
      shouldRenderVideoTrack({ isTrackReference: true, isMuted: false }),
    ).toBe(true);
  });

  it("hides muted publications", () => {
    expect(
      shouldRenderVideoTrack({ isTrackReference: true, isMuted: true }),
    ).toBe(false);
  });

  it("hides placeholders", () => {
    expect(
      shouldRenderVideoTrack({ isTrackReference: false, isMuted: false }),
    ).toBe(false);
  });
});
