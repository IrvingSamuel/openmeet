import { describe, expect, it } from "vitest";
import {
  gridColumns,
  resolveFeaturedTrack,
  trackKey,
} from "@/lib/stage";

function cam(identity: string) {
  return { participant: { identity }, source: "camera" as const };
}

function screen(identity: string) {
  return { participant: { identity }, source: "screen_share" as const };
}

describe("gridColumns", () => {
  it("gives a single tile the whole stage", () => {
    expect(gridColumns(0)).toBe(1);
    expect(gridColumns(1)).toBe(1);
  });

  it("grows the grid at the expected breakpoints", () => {
    expect(gridColumns(2)).toBe(2);
    expect(gridColumns(4)).toBe(2);
    expect(gridColumns(5)).toBe(3);
    expect(gridColumns(9)).toBe(3);
    expect(gridColumns(10)).toBe(4);
    expect(gridColumns(16)).toBe(4);
  });

  it("caps at five columns for large rooms", () => {
    expect(gridColumns(17)).toBe(5);
    expect(gridColumns(80)).toBe(5);
  });

  it("never returns more columns than tiles", () => {
    for (let n = 1; n <= 20; n++) {
      expect(gridColumns(n)).toBeLessThanOrEqual(Math.max(n, 1));
    }
  });

  it("caps columns by stage width on phones and tablets", () => {
    expect(gridColumns(8, 360)).toBe(1);
    expect(gridColumns(8, 500)).toBe(2);
    expect(gridColumns(8, 900)).toBe(3);
    expect(gridColumns(8, 1200)).toBe(3);
    expect(gridColumns(17, 1400)).toBe(5);
  });
});

describe("trackKey", () => {
  it("separates two sources from the same participant", () => {
    const participant = { identity: "ana" };
    expect(trackKey({ participant, source: "camera" })).not.toBe(
      trackKey({ participant, source: "screen_share" }),
    );
  });

  it("is stable across calls", () => {
    const ref = { participant: { identity: "caio" }, source: "camera" };
    expect(trackKey(ref)).toBe("caio:camera");
    expect(trackKey(ref)).toBe(trackKey({ ...ref }));
  });
});

describe("resolveFeaturedTrack", () => {
  const ana = cam("ana");
  const caio = cam("caio");
  const anaScreen = screen("ana");
  const tracks = [ana, caio];

  it("returns null for an empty stage", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [],
        pinnedKey: null,
        screenShare: null,
        speakingIdentities: [],
      }),
    ).toBeNull();
  });

  it("prefers screen share over pin and speaker", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [...tracks, anaScreen],
        pinnedKey: trackKey(caio),
        screenShare: anaScreen,
        speakingIdentities: ["caio"],
      }),
    ).toBe(anaScreen);
  });

  it("uses pin when there is no screen share", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: trackKey(caio),
        screenShare: null,
        speakingIdentities: ["ana"],
      }),
    ).toBe(caio);
  });

  it("falls through when pinnedKey is stale", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: "ghost:camera",
        screenShare: null,
        speakingIdentities: ["caio"],
      }),
    ).toBe(caio);
  });

  it("picks the first speaking participant camera", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: null,
        screenShare: null,
        speakingIdentities: ["caio", "ana"],
      }),
    ).toBe(caio);
  });

  it("falls back to the first camera track", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: null,
        screenShare: null,
        speakingIdentities: [],
      }),
    ).toBe(ana);
  });

  it("falls back to the first track when no camera exists", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [anaScreen],
        pinnedKey: null,
        screenShare: null,
        speakingIdentities: [],
      }),
    ).toBe(anaScreen);
  });
});
