import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { mkdir, stat, unlink } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ResolvedRecordingConfig } from "@/lib/app-settings";
import { resolveRecordingConfig } from "@/lib/app-settings";

export function objectKeyFor(meetingId: string, recordingId: string, ext = "webm") {
  return `${meetingId}/${recordingId}.${ext}`;
}

export function localPathFor(
  config: ResolvedRecordingConfig,
  meetingId: string,
  recordingId: string,
  ext = "webm",
) {
  return path.join(config.localDir, meetingId, `${recordingId}.${ext}`);
}

function requireS3(config: ResolvedRecordingConfig) {
  const { bucket, accessKey, secretKey, endpoint, region } = config.s3;
  if (!bucket || !accessKey || !secretKey) {
    throw new Error("s3_not_configured");
  }
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
  return { client, bucket };
}

export async function putRecordingObject(opts: {
  meetingId: string;
  recordingId: string;
  body: Buffer | Uint8Array | Readable;
  contentType: string;
  ext?: string;
  config?: ResolvedRecordingConfig;
}): Promise<{
  storageBackend: "local" | "s3";
  filepath: string | null;
  objectKey: string | null;
  storageUrl: string | null;
  bytes: number | null;
}> {
  const config = opts.config ?? (await resolveRecordingConfig());
  const ext = opts.ext ?? (opts.contentType.includes("mp4") ? "mp4" : "webm");
  const key = objectKeyFor(opts.meetingId, opts.recordingId, ext);

  if (config.storage === "s3") {
    const { client, bucket } = requireS3(config);
    const body =
      opts.body instanceof Readable
        ? opts.body
        : Buffer.isBuffer(opts.body)
          ? opts.body
          : Buffer.from(opts.body);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: opts.contentType,
      }),
    );
    const bytes =
      Buffer.isBuffer(body) || body instanceof Uint8Array ? body.byteLength : null;
    const endpoint = config.s3.endpoint?.replace(/\/$/, "");
    const storageUrl = endpoint
      ? `${endpoint}/${bucket}/${key}`
      : `s3://${bucket}/${key}`;
    return {
      storageBackend: "s3",
      filepath: null,
      objectKey: key,
      storageUrl,
      bytes,
    };
  }

  const filepath = localPathFor(config, opts.meetingId, opts.recordingId, ext);
  await mkdir(path.dirname(filepath), { recursive: true });
  if (opts.body instanceof Readable) {
    await pipeline(opts.body, createWriteStream(filepath));
  } else {
    const { writeFile } = await import("fs/promises");
    await writeFile(filepath, opts.body);
  }
  const info = await stat(filepath);
  return {
    storageBackend: "local",
    filepath,
    objectKey: null,
    storageUrl: null,
    bytes: info.size,
  };
}

/** Append a binary chunk to a local temp file (browser engine). */
export async function appendLocalChunk(opts: {
  meetingId: string;
  recordingId: string;
  chunk: Buffer;
  config?: ResolvedRecordingConfig;
}): Promise<string> {
  const config = opts.config ?? (await resolveRecordingConfig());
  const filepath = localPathFor(config, opts.meetingId, opts.recordingId, "webm");
  await mkdir(path.dirname(filepath), { recursive: true });
  const { appendFile } = await import("fs/promises");
  await appendFile(filepath, opts.chunk);
  return filepath;
}

export async function getRecordingSignedUrl(opts: {
  objectKey: string;
  expiresIn?: number;
  config?: ResolvedRecordingConfig;
}): Promise<string> {
  const config = opts.config ?? (await resolveRecordingConfig());
  const { client, bucket } = requireS3(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: opts.objectKey }),
    { expiresIn: opts.expiresIn ?? 3600 },
  );
}

export async function openLocalRecordingStream(filepath: string) {
  if (!existsSync(filepath)) {
    throw new Error("file_not_found");
  }
  const info = await stat(filepath);
  return {
    stream: createReadStream(filepath),
    size: info.size,
  };
}

export async function deleteRecordingObject(opts: {
  filepath?: string | null;
  objectKey?: string | null;
  config?: ResolvedRecordingConfig;
}) {
  const config = opts.config ?? (await resolveRecordingConfig());
  if (opts.filepath && existsSync(opts.filepath)) {
    await unlink(opts.filepath).catch(() => undefined);
  }
  if (opts.objectKey && config.storage === "s3") {
    try {
      const { client, bucket } = requireS3(config);
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: opts.objectKey }),
      );
    } catch (err) {
      console.warn("[openmeet] failed to delete s3 recording", err);
    }
  }
}

