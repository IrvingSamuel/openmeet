// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const meetingsFindFirst = vi.fn();
const transcriptFindMany = vi.fn();
const chatFindMany = vi.fn();
const copilotFindMany = vi.fn();
const participantsFindMany = vi.fn();
const getAppSettings = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
      transcriptSegments: {
        findMany: (...args: unknown[]) => transcriptFindMany(...args),
      },
      chatMessages: {
        findMany: (...args: unknown[]) => chatFindMany(...args),
      },
      copilotChatMessages: {
        findMany: (...args: unknown[]) => copilotFindMany(...args),
      },
      participants: {
        findMany: (...args: unknown[]) => participantsFindMany(...args),
      },
    },
  },
}));

vi.mock("@/lib/app-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/app-settings")>(
    "@/lib/app-settings",
  );
  return {
    ...actual,
    getAppSettings: (...args: unknown[]) => getAppSettings(...args),
  };
});

import {
  dispatchMeetingEndedWebhooks,
  resolveDeliveryTargets,
} from "@/lib/outbound-webhooks";

const meetingRow = {
  id: "meet-1",
  slug: "standup",
  title: "Standup",
  startedAt: new Date("2026-08-04T11:00:00.000Z"),
  endedAt: new Date("2026-08-04T11:30:00.000Z"),
  webhookUrl: null as string | null,
};

beforeEach(() => {
  meetingsFindFirst.mockReset();
  transcriptFindMany.mockReset();
  chatFindMany.mockReset();
  copilotFindMany.mockReset();
  participantsFindMany.mockReset();
  getAppSettings.mockReset();
  transcriptFindMany.mockResolvedValue([]);
  chatFindMany.mockResolvedValue([]);
  copilotFindMany.mockResolvedValue([]);
  participantsFindMany.mockResolvedValue([]);
  vi.unstubAllGlobals();
});

describe("resolveDeliveryTargets", () => {
  it("returns the meeting URL even when admin webhook is disabled", async () => {
    meetingsFindFirst.mockResolvedValue({
      ...meetingRow,
      webhookUrl: "https://lms.example.com/hooks/openmeet",
    });
    getAppSettings.mockResolvedValue({
      webhookEnabled: false,
      webhookUrl: "https://admin.example/hooks",
      webhookSecret: "sekrit",
      webhookEvents: null,
    });

    const targets = await resolveDeliveryTargets("meet-1");
    expect(targets).toEqual([
      {
        url: "https://lms.example.com/hooks/openmeet",
        secret: "sekrit",
        events: {
          transcript: true,
          chat: true,
          summary: true,
          tasks: true,
          recording: true,
          attendance: true,
        },
      },
    ]);
  });

  it("also sends to a distinct enabled admin URL", async () => {
    meetingsFindFirst.mockResolvedValue({
      ...meetingRow,
      webhookUrl: "https://lms.example.com/hooks/openmeet",
    });
    getAppSettings.mockResolvedValue({
      webhookEnabled: true,
      webhookUrl: "https://admin.example/hooks",
      webhookSecret: "sekrit",
      webhookEvents: { transcript: true, chat: false },
    });

    const targets = await resolveDeliveryTargets("meet-1");
    expect(targets.map((t) => t.url)).toEqual([
      "https://lms.example.com/hooks/openmeet",
      "https://admin.example/hooks",
    ]);
    expect(targets[1].events.chat).toBe(false);
  });

  it("does not duplicate when meeting and admin URLs match", async () => {
    meetingsFindFirst.mockResolvedValue({
      ...meetingRow,
      webhookUrl: "https://hooks.example/meet",
    });
    getAppSettings.mockResolvedValue({
      webhookEnabled: true,
      webhookUrl: "https://hooks.example/meet",
      webhookSecret: null,
      webhookEvents: null,
    });

    const targets = await resolveDeliveryTargets("meet-1");
    expect(targets).toHaveLength(1);
    expect(targets[0].url).toBe("https://hooks.example/meet");
  });

  it("returns empty when neither meeting nor admin URL is set", async () => {
    meetingsFindFirst.mockResolvedValue({ ...meetingRow, webhookUrl: null });
    getAppSettings.mockResolvedValue({
      webhookEnabled: true,
      webhookUrl: "",
      webhookSecret: null,
      webhookEvents: null,
    });

    expect(await resolveDeliveryTargets("meet-1")).toEqual([]);
  });
});

describe("dispatchMeetingEndedWebhooks", () => {
  it("POSTs to the meeting URL when admin webhook is off", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    meetingsFindFirst.mockResolvedValue({
      ...meetingRow,
      webhookUrl: "https://lms.example.com/hooks/openmeet",
    });
    getAppSettings.mockResolvedValue({
      webhookEnabled: false,
      webhookUrl: null,
      webhookSecret: null,
      webhookEvents: null,
    });
    transcriptFindMany.mockResolvedValue([
      {
        id: "seg-1",
        speakerLabel: "Ana",
        text: "Olá",
        isFinal: true,
        startedAtMs: 0,
        endedAtMs: 1000,
        createdAt: new Date("2026-08-04T11:01:00.000Z"),
      },
    ]);

    await dispatchMeetingEndedWebhooks("meet-1");

    expect(fetchMock).toHaveBeenCalled();
    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls.every((u) => u === "https://lms.example.com/hooks/openmeet")).toBe(
      true,
    );
    const events = fetchMock.mock.calls.map((call) => {
      const init = call[1] as { body: string };
      return JSON.parse(init.body).event;
    });
    expect(events).toContain("transcript.ready");
    expect(events).toContain("chat.ready");
    expect(events).toContain("attendance.ready");
  });

  it("POSTs to both meeting and admin URLs when they differ", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    meetingsFindFirst.mockResolvedValue({
      ...meetingRow,
      webhookUrl: "https://lms.example.com/hooks/openmeet",
    });
    getAppSettings.mockResolvedValue({
      webhookEnabled: true,
      webhookUrl: "https://admin.example/hooks",
      webhookSecret: null,
      webhookEvents: null,
    });

    await dispatchMeetingEndedWebhooks("meet-1");

    const urls = new Set(fetchMock.mock.calls.map((call) => call[0]));
    expect(urls).toEqual(
      new Set([
        "https://lms.example.com/hooks/openmeet",
        "https://admin.example/hooks",
      ]),
    );
  });
});
