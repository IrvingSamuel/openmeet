import { describe, expect, it } from "vitest";
import {
  gridColumns,
  gridPageCapacity,
  INITIAL_ACTIVE_SPEAKER_STATE,
  MAX_TILES_PER_PAGE,
  nextActiveSpeaker,
  orderForGrid,
  pageGridColumns,
  paginate,
  resolveFeaturedTrack,
  trackKey,
  type ActiveSpeakerState,
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

describe("gridPageCapacity", () => {
  it("fits as many minimum-size tiles as the stage allows", () => {
    // 4 columns × 3 rows of 240×135 with 12px gaps.
    expect(gridPageCapacity(1000, 430)).toBe(12);
  });

  it("caps the page size on very large stages", () => {
    expect(gridPageCapacity(4000, 3000)).toBe(MAX_TILES_PER_PAGE);
  });

  it("always shows at least one tile", () => {
    expect(gridPageCapacity(200, 100)).toBe(1);
  });

  it("falls back to the cap before the stage is measured", () => {
    expect(gridPageCapacity(0, 0)).toBe(MAX_TILES_PER_PAGE);
  });
});

describe("pageGridColumns", () => {
  it("widens the grid when rows would get too short", () => {
    // 12 tiles on 1000×430: 3 columns would need 4 rows, only 3 fit.
    expect(pageGridColumns(12, 1000, 430)).toBe(4);
  });

  it("keeps the usual shape when it fits", () => {
    expect(pageGridColumns(4, 1200, 800)).toBe(2);
  });
});

describe("paginate", () => {
  const list = [1, 2, 3, 4, 5, 6, 7];

  it("slices one page at a time", () => {
    expect(paginate(list, 3, 0)).toEqual({ items: [1, 2, 3], page: 0, pages: 3 });
    expect(paginate(list, 3, 2)).toEqual({ items: [7], page: 2, pages: 3 });
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(list, 3, 9).page).toBe(2);
    expect(paginate(list, 3, -1).page).toBe(0);
    expect(paginate([], 3, 4)).toEqual({ items: [], page: 0, pages: 1 });
  });
});

describe("orderForGrid", () => {
  const me = { participant: { identity: "me", isLocal: true }, source: "camera" };
  const ana = cam("ana");
  const bia = cam("bia");
  const caio = cam("caio");
  const duda = cam("duda");
  const caioScreen = screen("caio");

  it("ranks pin, screen share, local, then speakers and raised hands", () => {
    const ordered = orderForGrid([ana, bia, caio, duda, me, caioScreen], {
      pinnedKey: trackKey(duda),
      speakingIdentities: ["caio"],
      raisedIdentities: new Set(["bia"]),
    });
    expect(ordered).toEqual([duda, caioScreen, me, bia, caio, ana]);
  });

  it("keeps join order when nothing stands out", () => {
    expect(orderForGrid([caio, ana, bia])).toEqual([caio, ana, bia]);
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
        activeSpeakerIdentity: null,
      }),
    ).toBeNull();
  });

  it("prefers screen share over pin and speaker", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [...tracks, anaScreen],
        pinnedKey: trackKey(caio),
        screenShare: anaScreen,
        activeSpeakerIdentity: "caio",
      }),
    ).toBe(anaScreen);
  });

  it("uses pin when there is no screen share", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: trackKey(caio),
        screenShare: null,
        activeSpeakerIdentity: "ana",
      }),
    ).toBe(caio);
  });

  it("falls through when pinnedKey is stale", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: "ghost:camera",
        screenShare: null,
        activeSpeakerIdentity: "caio",
      }),
    ).toBe(caio);
  });

  it("picks the active speaker's camera", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: null,
        screenShare: null,
        activeSpeakerIdentity: "caio",
      }),
    ).toBe(caio);
  });

  it("falls back to the first camera track", () => {
    expect(
      resolveFeaturedTrack({
        tracks,
        pinnedKey: null,
        screenShare: null,
        activeSpeakerIdentity: null,
      }),
    ).toBe(ana);
  });

  it("falls back to the first track when no camera exists", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [anaScreen],
        pinnedKey: null,
        screenShare: null,
        activeSpeakerIdentity: null,
      }),
    ).toBe(anaScreen);
  });

  it("puts the global pin above screen share and the local pin", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [...tracks, anaScreen],
        pinnedKey: trackKey(ana),
        globalPinnedKey: trackKey(caio),
        screenShare: anaScreen,
        activeSpeakerIdentity: "ana",
      }),
    ).toBe(caio);
  });

  it("ignores a stale global pin", () => {
    expect(
      resolveFeaturedTrack({
        tracks: [...tracks, anaScreen],
        pinnedKey: null,
        globalPinnedKey: "ghost:camera",
        screenShare: anaScreen,
        activeSpeakerIdentity: null,
      }),
    ).toBe(anaScreen);
  });

  it("prefers a remote camera over the local one in the fallback", () => {
    const me = { participant: { identity: "me", isLocal: true }, source: "camera" };
    expect(
      resolveFeaturedTrack({
        tracks: [me, ana],
        pinnedKey: null,
        screenShare: null,
        activeSpeakerIdentity: null,
      }),
    ).toBe(ana);
  });
});

describe("nextActiveSpeaker", () => {
  const present = new Set(["ana", "caio", "bia"]);
  const opts = { minSpeakMs: 800, holdMs: 2500 };

  function run(
    steps: Array<[now: number, speaking: string[]]>,
    presentIds: ReadonlySet<string> = present,
  ) {
    let state: ActiveSpeakerState = INITIAL_ACTIVE_SPEAKER_STATE;
    let nextCheckAt: number | null = null;
    for (const [now, speaking] of steps) {
      ({ state, nextCheckAt } = nextActiveSpeaker(
        state,
        speaking,
        presentIds,
        now,
        opts,
      ));
    }
    return { state, nextCheckAt };
  }

  it("promotes a speaker only after minSpeakMs of continuous speech", () => {
    const pending = run([[0, ["ana"]]]);
    expect(pending.state.current).toBeNull();
    expect(pending.nextCheckAt).toBe(800);
    expect(run([[0, ["ana"]], [800, ["ana"]]]).state.current).toBe("ana");
  });

  it("keeps the speaker featured during silence", () => {
    const { state } = run([
      [0, ["ana"]],
      [800, ["ana"]],
      [1000, []],
      [10_000, []],
    ]);
    expect(state.current).toBe("ana");
  });

  it("ignores a short noise burst from someone else", () => {
    const { state } = run([
      [0, ["ana"]],
      [800, ["ana"]],
      [5000, []],
      [6000, ["caio"]],
      [6300, []],
      [9000, []],
    ]);
    expect(state.current).toBe("ana");
  });

  it("switches to a sustained new speaker once the hold has passed", () => {
    const { state } = run([
      [0, ["ana"]],
      [800, ["ana"]],
      [1000, ["caio", "ana"]],
      [1800, ["caio", "ana"]],
    ]);
    expect(state.current).toBe("ana");
    expect(
      run([
        [0, ["ana"]],
        [800, ["ana"]],
        [1000, ["caio", "ana"]],
        [3300, ["caio", "ana"]],
      ]).state.current,
    ).toBe("caio");
  });

  it("switches after minSpeakMs when the current speaker is quiet", () => {
    const { state } = run([
      [0, ["ana"]],
      [800, ["ana"]],
      [1000, ["caio"]],
      [1800, ["caio"]],
    ]);
    expect(state.current).toBe("caio");
  });

  it("clears the spotlight when the current speaker leaves", () => {
    let { state } = run([
      [0, ["ana"]],
      [800, ["ana"]],
    ]);
    ({ state } = nextActiveSpeaker(state, [], new Set(["caio"]), 2000, opts));
    expect(state.current).toBeNull();
  });

  it("does not flap between quickly alternating speakers", () => {
    const { state } = run([
      [0, ["ana"]],
      [800, ["ana"]],
      [1000, ["caio"]],
      [1400, ["ana"]],
      [1800, ["caio"]],
      [2200, ["ana"]],
      [2600, ["caio"]],
      [3000, ["ana"]],
    ]);
    expect(state.current).toBe("ana");
  });
});
