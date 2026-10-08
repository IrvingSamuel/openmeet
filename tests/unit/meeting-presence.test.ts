// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  analyzePresence,
  isShortSoloMeeting,
  meetingWasHeld,
  type PresenceRow,
} from "@/lib/meeting-presence";

const T0 = new Date("2026-10-08T18:27:00Z").getTime();
const at = (min: number) => new Date(T0 + min * 60_000);

function row(
  name: string,
  from: number,
  to: number | null,
  extra: Partial<PresenceRow> = {},
): PresenceRow {
  return {
    identityId: null,
    displayName: name,
    role: "participant",
    livekitIdentity: `guest_${name}_${from}`,
    connectedAt: at(from),
    leftAt: to == null ? null : at(to),
    ...extra,
  };
}

describe("analyzePresence", () => {
  it("sees seven guests talking for 29 minutes as together", () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`g${i}`, i * 0.5, 29));
    const p = analyzePresence(rows, at(30));
    expect(p).toMatchObject({ together: true, hostJoined: false });
    expect(meetingWasHeld(p, false)).toBe(true);
    expect(isShortSoloMeeting(p)).toBe(false);
  });

  it("treats one guest reloading as one person", () => {
    const rows = [row("Ana", 0, 1), row("Ana", 0.9, 2)];
    const p = analyzePresence(rows, at(3));
    expect(p.together).toBe(false);
    expect(p.durationSec).toBe(120);
  });

  it("does not count two guests who only crossed for a few seconds", () => {
    const rows = [row("Ana", 0, 2), row("Bia", 1.5, 3)];
    expect(analyzePresence(rows, at(4)).together).toBe(false);
  });

  it("ignores the captions agent and rows that never connected", () => {
    const rows = [
      row("Ana", 0, 10),
      row("agent", 0, 10, { livekitIdentity: "agent-openmeet" }),
      { ...row("Bia", 0, 10), connectedAt: null },
    ];
    const p = analyzePresence(rows, at(11));
    expect(p).toMatchObject({ sessions: 1, together: false });
  });

  it("counts open sessions until now", () => {
    expect(analyzePresence([row("Ana", 0, null)], at(7)).durationSec).toBe(420);
  });
});

describe("meetingWasHeld", () => {
  it("keeps a guest who waited two minutes and left open", () => {
    const p = analyzePresence([row("Ana", 0, 2)], at(2));
    expect(meetingWasHeld(p, true)).toBe(false);
    expect(isShortSoloMeeting(p)).toBe(true);
  });

  it("ends a lone participant after five minutes with a transcript", () => {
    const p = analyzePresence([row("Ana", 0, 6)], at(6));
    expect(meetingWasHeld(p, true)).toBe(true);
    expect(meetingWasHeld(p, false)).toBe(false);
    expect(isShortSoloMeeting(p)).toBe(false);
  });

  it("ends once the host joined, even alone and briefly", () => {
    const p = analyzePresence([row("Host", 0, 1, { role: "host" })], at(1));
    expect(meetingWasHeld(p, false)).toBe(true);
    expect(isShortSoloMeeting(p)).toBe(true);
  });

  it("falls back to the transcript when no connect was recorded", () => {
    const p = analyzePresence([], at(1));
    expect(meetingWasHeld(p, true)).toBe(true);
    expect(meetingWasHeld(p, false)).toBe(false);
    expect(isShortSoloMeeting(p)).toBe(false);
  });
});
