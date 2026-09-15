import { describe, expect, it } from "vitest";
import {
  attendanceToCsv,
  buildAttendanceList,
  type ParticipantAttendanceSource,
} from "@/lib/attendance";

const meeting = {
  startedAt: new Date("2026-08-04T11:00:00.000Z"),
  endedAt: new Date("2026-08-04T11:30:00.000Z"),
};

function row(
  partial: Partial<ParticipantAttendanceSource> & {
    displayName: string;
    livekitIdentity: string;
  },
): ParticipantAttendanceSource {
  return {
    identityId: null,
    role: "participant",
    joinedAt: new Date("2026-08-04T11:00:00.000Z"),
    connectedAt: new Date("2026-08-04T11:00:05.000Z"),
    leftAt: new Date("2026-08-04T11:30:00.000Z"),
    ...partial,
  };
}

describe("buildAttendanceList", () => {
  it("excludes agent identities", () => {
    const payload = buildAttendanceList(
      [
        row({
          displayName: "Ana",
          livekitIdentity: "user_1_a",
          identityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }),
        row({
          displayName: "Copilot",
          livekitIdentity: "agent-copilot",
          connectedAt: new Date("2026-08-04T11:00:01.000Z"),
        }),
      ],
      meeting,
    );
    expect(payload.presentCount).toBe(1);
    expect(payload.attendees[0]?.displayName).toBe("Ana");
  });

  it("excludes token-only rows when connectedAt tracking is active", () => {
    const payload = buildAttendanceList(
      [
        row({
          displayName: "Presente",
          livekitIdentity: "user_1_a",
          connectedAt: new Date("2026-08-04T11:01:00.000Z"),
        }),
        {
          displayName: "Só lobby",
          livekitIdentity: "guest_xyz",
          identityId: null,
          role: "participant",
          joinedAt: new Date("2026-08-04T11:00:30.000Z"),
          connectedAt: null,
          leftAt: null,
        },
      ],
      meeting,
    );
    expect(payload.presentCount).toBe(1);
    expect(payload.attendees[0]?.displayName).toBe("Presente");
  });

  it("includes all humans in legacy mode when no connectedAt exists", () => {
    const payload = buildAttendanceList(
      [
        {
          displayName: "Ana",
          livekitIdentity: "user_1_a",
          identityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          role: "host",
          joinedAt: new Date("2026-08-04T11:00:00.000Z"),
          connectedAt: null,
          leftAt: new Date("2026-08-04T11:30:00.000Z"),
        },
        {
          displayName: "Caio",
          livekitIdentity: "guest_1",
          identityId: null,
          role: "participant",
          joinedAt: new Date("2026-08-04T11:05:00.000Z"),
          connectedAt: null,
          leftAt: new Date("2026-08-04T11:25:00.000Z"),
        },
      ],
      meeting,
    );
    expect(payload.presentCount).toBe(2);
    expect(payload.attendees.map((a) => a.displayName)).toEqual([
      "Ana",
      "Caio",
    ]);
  });

  it("merges rejoins by identityId and marks host if any session was host", () => {
    const identityId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const payload = buildAttendanceList(
      [
        row({
          displayName: "Ana",
          livekitIdentity: "user_1_a",
          identityId,
          role: "host",
          connectedAt: new Date("2026-08-04T11:00:00.000Z"),
          leftAt: new Date("2026-08-04T11:10:00.000Z"),
        }),
        row({
          displayName: "Ana Silva",
          livekitIdentity: "user_1_b",
          identityId,
          role: "participant",
          connectedAt: new Date("2026-08-04T11:15:00.000Z"),
          leftAt: new Date("2026-08-04T11:30:00.000Z"),
        }),
      ],
      meeting,
    );
    expect(payload.presentCount).toBe(1);
    const attendee = payload.attendees[0]!;
    expect(attendee.role).toBe("host");
    expect(attendee.sessions).toHaveLength(2);
    expect(attendee.joinedAt).toBe("2026-08-04T11:00:00.000Z");
    expect(attendee.leftAt).toBe("2026-08-04T11:30:00.000Z");
    expect(attendee.durationMs).toBe(25 * 60 * 1000);
  });

  it("merges guest rejoins by normalized displayName", () => {
    const payload = buildAttendanceList(
      [
        row({
          displayName: "Caio",
          livekitIdentity: "guest_1",
          connectedAt: new Date("2026-08-04T11:02:00.000Z"),
          leftAt: new Date("2026-08-04T11:10:00.000Z"),
        }),
        row({
          displayName: "  caio  ",
          livekitIdentity: "guest_2",
          connectedAt: new Date("2026-08-04T11:12:00.000Z"),
          leftAt: new Date("2026-08-04T11:20:00.000Z"),
        }),
      ],
      meeting,
    );
    expect(payload.presentCount).toBe(1);
    expect(payload.attendees[0]?.sessions).toHaveLength(2);
  });
});

describe("attendanceToCsv", () => {
  it("exports header and escaped names", () => {
    const payload = buildAttendanceList(
      [
        row({
          displayName: 'Ana "Lead"',
          livekitIdentity: "user_1",
          identityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          role: "host",
        }),
      ],
      meeting,
    );
    const csv = attendanceToCsv(payload);
    expect(csv).toContain("displayName,role,identityId,joinedAt,leftAt,durationMs");
    expect(csv).toContain('"Ana ""Lead"""');
  });
});
