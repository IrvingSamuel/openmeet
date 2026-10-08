// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const receive = vi.fn();
const meetingsFindFirst = vi.fn();
const updateSet = vi.fn();
const hostEverConnected = vi.fn();
const dispatchEnded = vi.fn();
const generateSummary = vi.fn();
const stopRecording = vi.fn();
const stopLiveStream = vi.fn();

vi.mock("@/lib/livekit", () => ({
  getWebhookReceiver: () => ({ receive }),
}));

vi.mock("@/lib/hostAuth", () => ({
  meetingHostEverConnected: (...args: unknown[]) => hostEverConnected(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      meetings: {
        findFirst: (...args: unknown[]) => meetingsFindFirst(...args),
      },
    },
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        return { where: async () => undefined };
      },
    }),
  },
}));

vi.mock("@/lib/meeting-lifecycle", () => ({
  activateMeetingIfScheduled: vi.fn(),
}));
vi.mock("@/lib/meeting-summary", () => ({
  generateMeetingSummary: (...args: unknown[]) => generateSummary(...args),
}));
vi.mock("@/lib/outbound-webhooks", () => ({
  dispatchMeetingEndedWebhooks: (...args: unknown[]) => dispatchEnded(...args),
}));
vi.mock("@/lib/live-stream", () => ({
  handleLiveStreamEgressWebhook: vi.fn(),
  stopMeetingLiveStream: (...args: unknown[]) => stopLiveStream(...args),
}));
vi.mock("@/lib/recording", () => ({
  handleEgressWebhook: vi.fn(),
  stopMeetingRecording: (...args: unknown[]) => stopRecording(...args),
}));

import { POST as webhook } from "@/app/api/livekit/webhook/route";

function webhookRequest() {
  return new Request("http://localhost/api/livekit/webhook", {
    method: "POST",
    headers: { Authorization: "signed" },
    body: "{}",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const meeting = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  livekitRoomName: "meet_weekly",
  summaryStatus: "pending",
};

beforeEach(() => {
  receive.mockResolvedValue({
    event: "room_finished",
    room: { name: "meet_weekly", sid: "RM_1" },
  });
  meetingsFindFirst.mockResolvedValue(meeting);
  dispatchEnded.mockResolvedValue(undefined);
  generateSummary.mockResolvedValue(undefined);
  stopRecording.mockResolvedValue(undefined);
  stopLiveStream.mockResolvedValue(undefined);
});

describe("room_finished", () => {
  it("ends the meeting once the host has joined", async () => {
    hostEverConnected.mockResolvedValue(true);

    const res = await webhook(webhookRequest());
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ended" }),
    );
    expect(dispatchEnded).toHaveBeenCalledWith(meeting.id);
    expect(generateSummary).toHaveBeenCalledWith(meeting.id);
  });

  it("keeps the meeting joinable when only guests came and went", async () => {
    hostEverConnected.mockResolvedValue(false);

    const res = await webhook(webhookRequest());
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({
      status: "scheduled",
      livekitRoomSid: null,
    });
    expect(updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "ended" }),
    );
    expect(dispatchEnded).not.toHaveBeenCalled();
    expect(generateSummary).not.toHaveBeenCalled();
  });
});
