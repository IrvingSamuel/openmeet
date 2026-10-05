// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordingsFindFirst = vi.fn();
const recordingsFindMany = vi.fn();
const updateSet = vi.fn();
const listEgress = vi.fn();
const existsSync = vi.fn();
const stat = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      recordings: {
        findFirst: (...a: unknown[]) => recordingsFindFirst(...a),
        findMany: (...a: unknown[]) => recordingsFindMany(...a),
      },
      meetings: { findFirst: () => Promise.resolve(undefined) },
    },
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        const where = () => {
          const p = Promise.resolve([]);
          return Object.assign(p, { returning: () => Promise.resolve([]) });
        };
        return { where };
      },
    }),
  },
}));

vi.mock("livekit-server-sdk", async () => {
  const actual =
    await vi.importActual<typeof import("livekit-server-sdk")>(
      "livekit-server-sdk",
    );
  return {
    ...actual,
    EgressClient: class {
      listEgress = (...a: unknown[]) => listEgress(...a);
    },
  };
});

vi.mock("fs", () => ({ existsSync: (...a: unknown[]) => existsSync(...a) }));
vi.mock("fs/promises", () => ({ stat: (...a: unknown[]) => stat(...a) }));

vi.mock("@/lib/app-settings", () => ({
  resolveRecordingConfig: () =>
    Promise.resolve({ localDir: "/var/openmeet/recordings" }),
}));
vi.mock("@/lib/livekit", () => ({
  getLiveKitCreds: () => ({ apiKey: "k", apiSecret: "s" }),
  getLiveKitHttpHost: () => "http://127.0.0.1:7880",
}));
vi.mock("@/lib/outbound-webhooks", () => ({
  dispatchPreparedWebhook: () => Promise.resolve(),
}));
vi.mock("@/lib/recording-storage", () => ({
  appendLocalChunk: vi.fn(),
  putRecordingObject: vi.fn(),
  localPathFor: (
    config: { localDir: string },
    meetingId: string,
    recordingId: string,
    ext: string,
  ) => `${config.localDir}/${meetingId}/${recordingId}.${ext}`,
}));

import { EgressInfo, EgressStatus } from "livekit-server-sdk";
import {
  handleEgressWebhook,
  recoverStuckEgressRecordings,
} from "@/lib/recording";

const OVER_2_GIB = 3_191_523_699;

const stuckRow = {
  id: "rec-1",
  meetingId: "meet-1",
  egressId: "EG_1",
  engine: "egress",
  status: "uploading",
  storageBackend: "local",
  filepath: null,
  storageUrl: null,
  bytes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  recordingsFindFirst.mockResolvedValue(stuckRow);
  recordingsFindMany.mockResolvedValue([stuckRow]);
  listEgress.mockResolvedValue([]);
  existsSync.mockReturnValue(false);
});

describe("handleEgressWebhook", () => {
  it("stores a file size over 2 GiB as a number with the ready status", async () => {
    await handleEgressWebhook(
      new EgressInfo({
        egressId: "EG_1",
        status: EgressStatus.EGRESS_COMPLETE,
        fileResults: [{ filename: "/x.mp4", size: BigInt(OVER_2_GIB) }],
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready", bytes: OVER_2_GIB }),
    );
  });
});

describe("recoverStuckEgressRecordings", () => {
  it("replays what Egress reports when it still knows the egress", async () => {
    listEgress.mockResolvedValue([
      new EgressInfo({
        egressId: "EG_1",
        status: EgressStatus.EGRESS_COMPLETE,
        fileResults: [{ filename: "/x.mp4", size: BigInt(OVER_2_GIB) }],
      }),
    ]);

    const res = await recoverStuckEgressRecordings();
    expect(listEgress).toHaveBeenCalledWith({ egressId: "EG_1" });
    expect(res).toEqual([{ id: "rec-1", outcome: "recovered_from_egress" }]);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready", bytes: OVER_2_GIB }),
    );
  });

  it("falls back to the MP4 on disk when Egress forgot the egress", async () => {
    existsSync.mockReturnValue(true);
    stat.mockResolvedValue({ size: OVER_2_GIB });

    const res = await recoverStuckEgressRecordings();
    expect(existsSync).toHaveBeenCalledWith(
      "/var/openmeet/recordings/meet-1/rec-1.mp4",
    );
    expect(res).toEqual([
      { id: "rec-1", outcome: "recovered_from_disk", bytes: OVER_2_GIB },
    ]);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        bytes: OVER_2_GIB,
        filepath: "/var/openmeet/recordings/meet-1/rec-1.mp4",
      }),
    );
  });

  it("still tries the disk when Egress cannot be reached", async () => {
    listEgress.mockRejectedValue(new Error("connect ECONNREFUSED"));
    existsSync.mockReturnValue(true);
    stat.mockResolvedValue({ size: 10 });

    const res = await recoverStuckEgressRecordings();
    expect(res[0]?.outcome).toBe("recovered_from_disk");
  });

  it("leaves a recording Egress is still writing alone", async () => {
    listEgress.mockResolvedValue([
      new EgressInfo({ egressId: "EG_1", status: EgressStatus.EGRESS_ENDING }),
    ]);

    const res = await recoverStuckEgressRecordings();
    expect(res).toEqual([{ id: "rec-1", outcome: "still_running" }]);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("reports rows with neither Egress info nor a local file", async () => {
    const res = await recoverStuckEgressRecordings();
    expect(res).toEqual([{ id: "rec-1", outcome: "unrecoverable" }]);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("does nothing when no recording is stuck", async () => {
    recordingsFindMany.mockResolvedValue([]);
    expect(await recoverStuckEgressRecordings()).toEqual([]);
    expect(listEgress).not.toHaveBeenCalled();
  });
});
