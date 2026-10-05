import { describe, expect, it } from "vitest";
import { screenShareCaptureOptions } from "@/lib/screen-share";

describe("screenShareCaptureOptions", () => {
  it("disables audio when withAudio is false", () => {
    expect(screenShareCaptureOptions(false)).toEqual({ audio: false });
  });

  it("enables audio and systemAudio when withAudio is true", () => {
    expect(screenShareCaptureOptions(true)).toEqual({
      audio: true,
      systemAudio: "include",
    });
  });
});
