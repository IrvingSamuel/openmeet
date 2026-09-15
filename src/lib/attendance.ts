/** Attendance list derived from `participants` rows after a meeting ends. */

export type AttendanceSessionRow = {
  joinedAt: string;
  leftAt: string | null;
};

export type AttendanceAttendee = {
  displayName: string;
  role: "host" | "participant";
  identityId: string | null;
  joinedAt: string;
  leftAt: string | null;
  durationMs: number | null;
  sessions: AttendanceSessionRow[];
};

export type AttendancePayload = {
  attendees: AttendanceAttendee[];
  presentCount: number;
  meetingStartedAt: string;
  meetingEndedAt: string | null;
};

export type ParticipantAttendanceSource = {
  identityId: string | null;
  displayName: string;
  role: string;
  livekitIdentity: string;
  joinedAt: Date;
  connectedAt: Date | null;
  leftAt: Date | null;
};

function isAgentIdentity(livekitIdentity: string): boolean {
  const id = livekitIdentity.toLowerCase();
  return id.startsWith("agent-") || id.startsWith("agent_");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sessionStart(row: ParticipantAttendanceSource): Date {
  return row.connectedAt ?? row.joinedAt;
}

function groupKey(row: ParticipantAttendanceSource): string {
  if (row.identityId) return `id:${row.identityId}`;
  return `name:${normalizeName(row.displayName)}`;
}

function durationBetween(start: Date, end: Date | null): number | null {
  if (!end) return null;
  const ms = end.getTime() - start.getTime();
  return ms < 0 ? 0 : ms;
}

/**
 * Build a deduplicated attendance list.
 *
 * - Excludes LiveKit agent identities.
 * - If any row has `connectedAt`, only rows that connected count (lobby-only
 *   token mints are dropped). Otherwise legacy mode: include all humans.
 * - Rejoins are merged by `identityId`, or normalized `displayName` for guests.
 */
export function buildAttendanceList(
  rows: ParticipantAttendanceSource[],
  meeting: { startedAt: Date; endedAt: Date | null },
): AttendancePayload {
  const trackingEnabled = rows.some((r) => r.connectedAt != null);
  const eligible = rows.filter((r) => {
    if (isAgentIdentity(r.livekitIdentity)) return false;
    if (trackingEnabled && r.connectedAt == null) return false;
    return true;
  });

  const groups = new Map<string, ParticipantAttendanceSource[]>();
  for (const row of eligible) {
    const key = groupKey(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const attendees: AttendanceAttendee[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) => sessionStart(a).getTime() - sessionStart(b).getTime(),
    );
    const first = group[0]!;
    const isHost = group.some((r) => r.role === "host");
    const sessions: AttendanceSessionRow[] = group.map((r) => {
      const start = sessionStart(r);
      return {
        joinedAt: start.toISOString(),
        leftAt: r.leftAt ? r.leftAt.toISOString() : null,
      };
    });

    let durationMs = 0;
    let allClosed = true;
    for (const r of group) {
      const start = sessionStart(r);
      const end = r.leftAt;
      if (!end) {
        allClosed = false;
        continue;
      }
      durationMs += durationBetween(start, end) ?? 0;
    }

    const lastLeft = group.reduce<Date | null>((acc, r) => {
      if (!r.leftAt) return acc;
      if (!acc || r.leftAt.getTime() > acc.getTime()) return r.leftAt;
      return acc;
    }, null);

    attendees.push({
      displayName: first.displayName,
      role: isHost ? "host" : "participant",
      identityId: first.identityId,
      joinedAt: sessionStart(first).toISOString(),
      leftAt: allClosed && lastLeft ? lastLeft.toISOString() : null,
      durationMs: allClosed ? durationMs : null,
      sessions,
    });
  }

  attendees.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

  return {
    attendees,
    presentCount: attendees.length,
    meetingStartedAt: meeting.startedAt.toISOString(),
    meetingEndedAt: meeting.endedAt ? meeting.endedAt.toISOString() : null,
  };
}

export function attendanceToCsv(payload: AttendancePayload): string {
  const header = [
    "displayName",
    "role",
    "identityId",
    "joinedAt",
    "leftAt",
    "durationMs",
  ];
  const lines = [header.join(",")];
  for (const a of payload.attendees) {
    const cells = [
      csvEscape(a.displayName),
      a.role,
      a.identityId ?? "",
      a.joinedAt,
      a.leftAt ?? "",
      a.durationMs != null ? String(a.durationMs) : "",
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
