// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  isLoggedIn: false,
  identityId: undefined as string | undefined,
};

const assertMeetingHost = vi.fn();
const startMeetingRecording = vi.fn();
const stopMeetingRecording = vi.fn();
const listMeetingRecordings = vi.fn();
const resolveRecordingConfig = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => session,
}));

vi.mock("@/lib/hostAuth", () => ({
  assertMeetingHost: (...args: unknown[]) => assertMeetingHost(...args),
}));

vi.mock("@/lib/app-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/app-settings")>(
    "@/lib/app-settings",
  );
  return {
    ...actual,
    resolveRecordingConfig: (...args: unknown[]) =>
      resolveRecordingConfig(...args),
  };
});

vi.mock("@/lib/recording", () => ({
  startMeetingRecording: (...args: unknown[]) => startMeetingRecording(...args),
  stopMeetingRecording: (...args: unknown[]) => stopMeetingRecording(...args),
  listMeetingRecordings: (...args: unknown[]) => listMeetingRecordings(...args),
  serializeRecording: (row: {
    id: string;
    meetingId: string;
    status: string;
    engine: string;
    storageBackend: string;
    mimeType: string | null;
    bytes: number | null;
    error: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
  }) => ({
    id: row.id,
    meetingId: row.meetingId,
    status: row.status,
    engine: row.engine,
    storageBackend: row.storageBackend,
    mimeType: row.mimeType,
    bytes: row.bytes,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    downloadUrl:
      row.status === "ready"
        ? `/api/meetings/${row.meetingId}/recording/${row.id}/file`
        : null,
  }),
}));

import { GET, POST } from "@/app/api/meetings/[id]/recording/route";

const meetingId = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ id: meetingId }) };
}

function jsonRequest(body: unknown) {
  return new Request(`http://localhost/api/meetings/${meetingId}/recording`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  session.isLoggedIn = false;
  session.identityId = undefined;
  assertMeetingHost.mockReset();
  startMeetingRecording.mockReset();
  stopMeetingRecording.mockReset();
  listMeetingRecordings.mockReset();
  resolveRecordingConfig.mockReset();
  resolveRecordingConfig.mockResolvedValue({
    enabled: true,
    engine: "browser",
    controlMode: "manual",
    storage: "local",
    localDir: "/tmp/recordings",
    s3: {},
    sources: {},
  });
});

describe("GET /api/meetings/[id]/recording", () => {
  it("rejects non-host", async () => {
    assertMeetingHost.mockResolvedValue({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    const res = await GET(
      new Request("http://localhost") as never,
      ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("lists recordings for host", async () => {
    session.isLoggedIn = true;
    session.identityId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    assertMeetingHost.mockResolvedValue({
      ok: true,
      room: { id: "room" },
    });
    listMeetingRecordings.mockResolvedValue([
      {
        id: "rec-1",
        meetingId,
        status: "ready",
        engine: "browser",
        storageBackend: "local",
        mimeType: "video/webm",
        bytes: 1000,
        error: null,
        startedAt: new Date("2026-08-04T12:00:00Z"),
        endedAt: new Date("2026-08-04T12:30:00Z"),
        createdAt: new Date("2026-08-04T12:00:00Z"),
      },
    ]);
    const res = await GET(
      new Request("http://localhost") as never,
      ctx(),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(true);
    expect(json.recordings).toHaveLength(1);
    expect(json.recordings[0].downloadUrl).toContain("/file");
  });
});

describe("POST /api/meetings/[id]/recording", () => {
  it("starts recording for host", async () => {
    session.isLoggedIn = true;
    assertMeetingHost.mockResolvedValue({ ok: true, room: { id: "room" } });
    startMeetingRecording.mockResolvedValue({
      ok: true,
      engine: "browser",
      recording: {
        id: "rec-1",
        meetingId,
        status: "recording",
        engine: "browser",
        storageBackend: "local",
        mimeType: "video/webm",
        bytes: null,
        error: null,
        startedAt: new Date(),
        endedAt: null,
        createdAt: new Date(),
      },
    });
    const res = await POST(jsonRequest({ action: "start" }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.recording.id).toBe("rec-1");
  });

  it("stops recording for host", async () => {
    session.isLoggedIn = true;
    assertMeetingHost.mockResolvedValue({ ok: true, room: { id: "room" } });
    stopMeetingRecording.mockResolvedValue({
      ok: true,
      recording: {
        id: "rec-1",
        meetingId,
        status: "ready",
        engine: "browser",
        storageBackend: "local",
        mimeType: "video/webm",
        bytes: 42,
        error: null,
        startedAt: new Date(),
        endedAt: new Date(),
        createdAt: new Date(),
      },
    });
    const res = await POST(jsonRequest({ action: "stop" }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recording.status).toBe("ready");
  });
});
