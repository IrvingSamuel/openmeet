import { and, desc, eq, inArray } from "drizzle-orm";
import { existsSync } from "fs";
import { stat } from "fs/promises";
import {
  EncodedFileOutput,
  EncodedFileType,
  EgressClient,
  EgressStatus,
  EncodingOptionsPreset,
  S3Upload,
  type EgressInfo,
} from "livekit-server-sdk";
import { db } from "@/db";
import { meetings, recordings, rooms } from "@/db/schema";
import {
  getAppSettings,
  resolveRecordingConfig,
  webhookEventsOrDefault,
  type ResolvedRecordingConfig,
} from "@/lib/app-settings";
import { getLiveKitCreds, getLiveKitHttpHost } from "@/lib/livekit";
import { deliverWebhook } from "@/lib/outbound-webhooks";
import {
  appendLocalChunk,
  localPathFor,
  putRecordingObject,
} from "@/lib/recording-storage";

export function getEgressClient() {
  const { apiKey, apiSecret } = getLiveKitCreds();
  return new EgressClient(getLiveKitHttpHost(), apiKey, apiSecret);
}

async function activeRecording(meetingId: string) {
  return db.query.recordings.findFirst({
    where: and(
      eq(recordings.meetingId, meetingId),
      inArray(recordings.status, ["pending", "recording", "uploading"]),
    ),
    orderBy: [desc(recordings.createdAt)],
  });
}

export async function listMeetingRecordings(meetingId: string) {
  return db.query.recordings.findMany({
    where: eq(recordings.meetingId, meetingId),
    orderBy: [desc(recordings.createdAt)],
  });
}

async function dispatchRecordingReady(recordingId: string) {
  const row = await db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });
  if (!row || row.status !== "ready") return;

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, row.meetingId),
  });
  if (!meeting) return;
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, meeting.roomId),
  });

  const settings = await getAppSettings();
  if (!settings?.webhookEnabled || !settings.webhookUrl?.trim()) return;
  const events = webhookEventsOrDefault(settings.webhookEvents);
  if (!events.recording) return;

  const envelope = {
    event: "recording.ready" as const,
    version: 1 as const,
    sentAt: new Date().toISOString(),
    meeting: {
      id: meeting.id,
      roomSlug: room?.slug ?? "",
      roomTitle: room?.title ?? "",
      startedAt: meeting.startedAt.toISOString(),
      endedAt: meeting.endedAt ? meeting.endedAt.toISOString() : null,
    },
    data: {
      recordingId: row.id,
      status: row.status,
      engine: row.engine,
      storageBackend: row.storageBackend,
      mimeType: row.mimeType,
      bytes: row.bytes,
      downloadPath: `/api/meetings/${meeting.id}/recording/${row.id}/file`,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
    },
  };

  void deliverWebhook({
    url: settings.webhookUrl.trim(),
    secret: settings.webhookSecret,
    envelope,
  }).catch((err) => {
    console.error("[chronos-meet] recording.ready webhook failed", err);
  });
}

export async function startMeetingRecording(opts: {
  meetingId: string;
  /** When true, allow start even if controlMode is auto (server-side auto). */
  allowAuto?: boolean;
}): Promise<
  | { ok: true; recording: typeof recordings.$inferSelect; engine: string }
  | { ok: false; error: string; status: number; detail?: string }
> {
  const config = await resolveRecordingConfig();
  if (!config.enabled) {
    return { ok: false, error: "recording_disabled", status: 403 };
  }
  if (config.controlMode === "auto" && !opts.allowAuto) {
    return { ok: false, error: "auto_mode", status: 403 };
  }

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, opts.meetingId),
  });
  if (!meeting || meeting.status !== "active") {
    return { ok: false, error: "meeting_not_active", status: 409 };
  }

  const existing = await activeRecording(opts.meetingId);
  if (existing) {
    return { ok: true, recording: existing, engine: existing.engine };
  }

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.id, meeting.roomId),
  });
  if (!room) {
    return { ok: false, error: "room_not_found", status: 404 };
  }

  if (config.storage === "s3") {
    if (!config.s3.bucket || !config.s3.accessKey || !config.s3.secretKey) {
      return { ok: false, error: "s3_not_configured", status: 400 };
    }
  }

  const [row] = await db
    .insert(recordings)
    .values({
      meetingId: opts.meetingId,
      status: "recording",
      engine: config.engine,
      storageBackend: config.storage,
      mimeType: config.engine === "egress" ? "video/mp4" : "video/webm",
      startedAt: new Date(),
    })
    .returning();

  if (config.engine === "egress") {
    try {
      const egressId = await startEgressComposite({
        config,
        livekitRoomName: room.livekitRoomName,
        meetingId: opts.meetingId,
        recordingId: row.id,
      });
      const [updated] = await db
        .update(recordings)
        .set({ egressId })
        .where(eq(recordings.id, row.id))
        .returning();
      return { ok: true, recording: updated ?? row, engine: "egress" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[chronos-meet] egress start failed", message);
      await db
        .update(recordings)
        .set({ status: "failed", error: message, endedAt: new Date() })
        .where(eq(recordings.id, row.id));
      return {
        ok: false,
        error: "egress_start_failed",
        status: 502,
        detail: message,
      };
    }
  }

  return { ok: true, recording: row, engine: "browser" };
}

async function startEgressComposite(opts: {
  config: ResolvedRecordingConfig;
  livekitRoomName: string;
  meetingId: string;
  recordingId: string;
}) {
  const client = getEgressClient();
  const filepath = `${opts.meetingId}/${opts.recordingId}.mp4`;

  let fileOutput: EncodedFileOutput;
  if (opts.config.storage === "s3") {
    const { bucket, accessKey, secretKey, endpoint, region } = opts.config.s3;
    if (!bucket || !accessKey || !secretKey) {
      throw new Error("s3_not_configured");
    }
    fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey,
          secret: secretKey,
          bucket,
          region,
          endpoint: endpoint || undefined,
          forcePathStyle: Boolean(endpoint),
        }),
      },
    });
  } else {
    const absolute = localPathFor(
      opts.config,
      opts.meetingId,
      opts.recordingId,
      "mp4",
    );
    fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: absolute,
    });
  }

  const info = await client.startRoomCompositeEgress(
    opts.livekitRoomName,
    fileOutput,
    {
      layout: "grid",
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
      audioOnly: false,
    },
  );
  return info.egressId;
}

export async function appendBrowserChunk(opts: {
  meetingId: string;
  recordingId: string;
  chunk: Buffer;
}) {
  const row = await db.query.recordings.findFirst({
    where: and(
      eq(recordings.id, opts.recordingId),
      eq(recordings.meetingId, opts.meetingId),
    ),
  });
  if (!row) return { ok: false as const, error: "not_found", status: 404 };
  if (row.engine !== "browser") {
    return { ok: false as const, error: "wrong_engine", status: 400 };
  }
  if (row.status !== "recording") {
    return { ok: false as const, error: "not_recording", status: 409 };
  }
  const config = await resolveRecordingConfig();
  const filepath = await appendLocalChunk({
    meetingId: opts.meetingId,
    recordingId: opts.recordingId,
    chunk: opts.chunk,
    config,
  });
  await db
    .update(recordings)
    .set({ filepath })
    .where(eq(recordings.id, row.id));
  return { ok: true as const };
}

export async function stopMeetingRecording(opts: {
  meetingId: string;
  /** Force stop even in auto mode (meeting end). */
  force?: boolean;
}): Promise<
  | { ok: true; recording: typeof recordings.$inferSelect | null }
  | { ok: false; error: string; status: number; detail?: string }
> {
  const config = await resolveRecordingConfig();
  if (config.controlMode === "auto" && !opts.force) {
    return { ok: false, error: "auto_mode_no_stop", status: 403 };
  }

  const row = await activeRecording(opts.meetingId);
  if (!row) {
    return { ok: true, recording: null };
  }

  if (row.engine === "egress" && row.egressId) {
    try {
      const client = getEgressClient();
      await client.stopEgress(row.egressId);
      const [updated] = await db
        .update(recordings)
        .set({ status: "uploading" })
        .where(eq(recordings.id, row.id))
        .returning();
      return { ok: true, recording: updated ?? row };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[chronos-meet] egress stop failed", message);
      await db
        .update(recordings)
        .set({ status: "failed", error: message, endedAt: new Date() })
        .where(eq(recordings.id, row.id));
      return {
        ok: false,
        error: "egress_stop_failed",
        status: 502,
        detail: message,
      };
    }
  }

  // Browser: finalize local file → optional S3 upload
  return finalizeBrowserRecording(row.id);
}

async function finalizeBrowserRecording(recordingId: string) {
  const row = await db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });
  if (!row) {
    return { ok: false as const, error: "not_found", status: 404 };
  }

  const config = await resolveRecordingConfig();
  const filepath =
    row.filepath ||
    localPathFor(config, row.meetingId, row.id, "webm");

  if (!existsSync(filepath)) {
    const [failed] = await db
      .update(recordings)
      .set({
        status: "failed",
        error: "empty_recording",
        endedAt: new Date(),
      })
      .where(eq(recordings.id, row.id))
      .returning();
    return { ok: true as const, recording: failed ?? row };
  }

  await db
    .update(recordings)
    .set({ status: "uploading" })
    .where(eq(recordings.id, row.id));

  try {
    if (config.storage === "s3") {
      const { createReadStream } = await import("fs");
      const stored = await putRecordingObject({
        meetingId: row.meetingId,
        recordingId: row.id,
        body: createReadStream(filepath),
        contentType: "video/webm",
        ext: "webm",
        config,
      });
      const [updated] = await db
        .update(recordings)
        .set({
          status: "ready",
          storageBackend: "s3",
          objectKey: stored.objectKey,
          storageUrl: stored.storageUrl,
          filepath: null,
          bytes: stored.bytes,
          mimeType: "video/webm",
          endedAt: new Date(),
        })
        .where(eq(recordings.id, row.id))
        .returning();
      // Clean local temp
      const { unlink } = await import("fs/promises");
      await unlink(filepath).catch(() => undefined);
      if (updated) void dispatchRecordingReady(updated.id);
      return { ok: true as const, recording: updated ?? row };
    }

    const info = await stat(filepath);
    const [updated] = await db
      .update(recordings)
      .set({
        status: "ready",
        storageBackend: "local",
        filepath,
        bytes: info.size,
        mimeType: "video/webm",
        endedAt: new Date(),
      })
      .where(eq(recordings.id, row.id))
      .returning();
    if (updated) void dispatchRecordingReady(updated.id);
    return { ok: true as const, recording: updated ?? row };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(recordings)
      .set({ status: "failed", error: message, endedAt: new Date() })
      .where(eq(recordings.id, row.id))
      .returning();
    return { ok: false as const, error: "finalize_failed", status: 500, recording: failed };
  }
}

export async function handleEgressWebhook(info: EgressInfo) {
  if (!info.egressId) return;

  const row = await db.query.recordings.findFirst({
    where: eq(recordings.egressId, info.egressId),
  });
  if (!row) return;

  if (info.status === EgressStatus.EGRESS_COMPLETE) {
    const file = info.fileResults?.[0];
    const filename = file?.filename || `${row.meetingId}/${row.id}.mp4`;
    const [updated] = await db
      .update(recordings)
      .set({
        status: "ready",
        objectKey: row.storageBackend === "s3" ? filename : null,
        filepath: row.storageBackend === "local" ? filename : row.filepath,
        storageUrl: file?.location || row.storageUrl,
        bytes: file?.size ? Number(file.size) : row.bytes,
        mimeType: "video/mp4",
        endedAt: new Date(),
        error: null,
      })
      .where(eq(recordings.id, row.id))
      .returning();
    if (updated) void dispatchRecordingReady(updated.id);
    return;
  }

  if (
    info.status === EgressStatus.EGRESS_FAILED ||
    info.status === EgressStatus.EGRESS_ABORTED ||
    info.status === EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    await db
      .update(recordings)
      .set({
        status: "failed",
        error: info.error || `egress_status_${info.status}`,
        endedAt: new Date(),
      })
      .where(eq(recordings.id, row.id));
  } else if (info.status === EgressStatus.EGRESS_ACTIVE) {
    await db
      .update(recordings)
      .set({ status: "recording" })
      .where(eq(recordings.id, row.id));
  } else if (info.status === EgressStatus.EGRESS_ENDING) {
    await db
      .update(recordings)
      .set({ status: "uploading" })
      .where(eq(recordings.id, row.id));
  }
}

export function serializeRecording(
  row: typeof recordings.$inferSelect,
  meetingId: string,
) {
  return {
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
        ? `/api/meetings/${meetingId}/recording/${row.id}/file`
        : null,
  };
}
