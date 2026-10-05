import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  EgressStatus,
  EncodingOptionsPreset,
  StreamOutput,
  StreamProtocol,
  type EgressInfo,
} from "livekit-server-sdk";
import { db } from "@/db";
import { liveStreams, meetings, type LiveStreamStatus } from "@/db/schema";
import { resolveLiveStreamConfig, resolveLocale } from "@/lib/app-settings";
import { getEgressClient } from "@/lib/recording";
import { locales, routing, type AppLocale } from "@/i18n/routing";

export const DEFAULT_RTMP_URL = "rtmp://a.rtmp.youtube.com/live2";

const ACTIVE_STATUSES: LiveStreamStatus[] = ["starting", "live", "ending"];

/** Egress that never reported back after this long is considered gone. */
const ORPHAN_AFTER_MS = 90_000;

type LiveStreamRow = typeof liveStreams.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status: number; detail?: string };

/** Stream keys must never reach logs or the DB. */
function redactRtmp(message: string): string {
  return message.replace(/(rtmps?:\/\/[^\s"']+\/)[^\s"'/]+/gi, "$1••••");
}

function isValidStreamKey(key: string) {
  return /^[A-Za-z0-9_\-.]{4,200}$/.test(key);
}

/*
 * Accepted RTMP destinations. Without this, any host could make Egress open a
 * connection to any address it liked — including services internal to the
 * machine, with the error message coming back to the client — and the install
 * became a free re-streaming service at ~4 vCPU per stream.
 *
 * YouTube ingest only by default. `LIVE_STREAM_ALLOWED_HOSTS` replaces the
 * list (comma-separated) and `*` restores the open behaviour.
 */
const DEFAULT_ALLOWED_RTMP_HOSTS = [
  "a.rtmp.youtube.com",
  "b.rtmp.youtube.com",
  "a.rtmps.youtube.com",
  "b.rtmps.youtube.com",
];

const ALLOWED_RTMP_PORTS = ["", "1935", "443"];

/** null = any host (`LIVE_STREAM_ALLOWED_HOSTS=*`). */
export function allowedRtmpHosts(): string[] | null {
  const raw = process.env.LIVE_STREAM_ALLOWED_HOSTS?.trim();
  if (!raw) return DEFAULT_ALLOWED_RTMP_HOSTS;
  if (raw === "*") return null;
  const hosts = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : DEFAULT_ALLOWED_RTMP_HOSTS;
}

type RtmpUrlCheck =
  | { ok: true; url: string }
  | { ok: false; error: "invalid_rtmp_url" | "rtmp_host_not_allowed" };

export function checkRtmpUrl(raw: string | undefined | null): RtmpUrlCheck {
  const invalid = { ok: false, error: "invalid_rtmp_url" } as const;
  const value = (raw?.trim() || DEFAULT_RTMP_URL).replace(/\/+$/, "");
  if (value.length > 300 || /\s/.test(value)) return invalid;
  if (!/^rtmps?:\/\/[^/]+/i.test(value)) return invalid;
  // WHATWG URL and the RTMP client inside Egress may disagree on where the
  // host ends around these (e.g. `rtmp://allowed?@127.0.0.1/x`), and none of
  // them belongs in an ingest URL. Credentials would also hide the real host.
  if (/[?#@\\]/.test(value)) return invalid;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalid;
  }

  // Non-special schemes (rtmp:) do not lowercase the host.
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedRtmpHosts();
  if (allowed) {
    if (!allowed.includes(host)) {
      return { ok: false, error: "rtmp_host_not_allowed" };
    }
    if (!ALLOWED_RTMP_PORTS.includes(parsed.port)) {
      return { ok: false, error: "rtmp_host_not_allowed" };
    }
  }

  // Egress gets the URL rebuilt from what was validated, never the raw input.
  const port = parsed.port ? `:${parsed.port}` : "";
  const path = parsed.pathname.replace(/\/+$/, "");
  return {
    ok: true,
    url: `${parsed.protocol.toLowerCase()}//${host}${port}${path}`,
  };
}

export function normalizeRtmpUrl(raw: string | undefined | null): string | null {
  const check = checkRtmpUrl(raw);
  return check.ok ? check.url : null;
}

/*
 * Per-meeting permission. The instance switch (app_settings) is all or
 * nothing: when on, every host of every meeting can go live. Whoever creates
 * the meeting through the API (e.g. a platform deciding from the customer's
 * plan) says whether this one may; a meeting without a value follows
 * LIVE_STREAM_MEETING_DEFAULT — "on" by default, which is the behaviour from
 * before this column existed.
 */
export function meetingLiveStreamAllowed(row: {
  liveStreamEnabled?: boolean | null;
}): boolean {
  if (typeof row.liveStreamEnabled === "boolean") return row.liveStreamEnabled;
  const raw = process.env.LIVE_STREAM_MEETING_DEFAULT?.trim().toLowerCase();
  return !(raw === "off" || raw === "false" || raw === "0");
}

/*
 * Cap on simultaneous live streams for the install. Each one is a ~4 vCPU
 * headless Chrome sharing the machine with recordings; Egress' `cpu_cost` only
 * refuses once the CPU is already gone, too late for whoever is recording.
 * `LIVE_STREAM_MAX_CONCURRENT=none` removes the cap.
 */
const DEFAULT_MAX_CONCURRENT = 2;

const LIVE_START_LOCK = "openmeet:live_stream_start";

export function maxConcurrentLiveStreams(): number | null {
  const raw = process.env.LIVE_STREAM_MAX_CONCURRENT?.trim().toLowerCase();
  if (!raw) return DEFAULT_MAX_CONCURRENT;
  if (raw === "none") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CONCURRENT;
}

/*
 * Counts what Egress reports as running, not just DB rows: a row stuck in
 * `live` because a webhook was lost must not hold a slot forever. A row with
 * no egressId yet is a start in flight — it counts while it is recent.
 */
async function countRunningLiveStreams(tx: Tx): Promise<number> {
  const rows = await tx.query.liveStreams.findMany({
    where: inArray(liveStreams.status, ACTIVE_STATUSES),
    columns: { egressId: true, createdAt: true },
  });
  if (rows.length === 0) return 0;

  const running = await getEgressClient().listEgress({ active: true });
  const runningIds = new Set(running.map((e) => e.egressId));
  const now = Date.now();
  return rows.filter((r) =>
    r.egressId
      ? runningIds.has(r.egressId)
      : now - r.createdAt.getTime() < ORPHAN_AFTER_MS,
  ).length;
}

async function liveViewLocale(): Promise<AppLocale> {
  const prefix = (await resolveLocale()).slice(0, 2).toLowerCase();
  return (locales as readonly string[]).includes(prefix)
    ? (prefix as AppLocale)
    : routing.defaultLocale;
}

function liveViewBaseUrl(): string {
  const base =
    process.env.LIVE_VIEW_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://127.0.0.1:3332";
  return base.replace(/\/+$/, "");
}

const HEALTH_TIMEOUT_MS = 2_000;

export type EgressHealth = {
  /** null when the check is disabled (EGRESS_HEALTH_URL=none). */
  online: boolean | null;
  healthUrl: string | null;
};

/** `health_port` from egress.yaml; Egress answers its status as JSON on `/`. */
function egressHealthUrl(): string | null {
  const raw = process.env.EGRESS_HEALTH_URL?.trim();
  if (raw && ["none", "off", "false", "0"].includes(raw.toLowerCase())) {
    return null;
  }
  return raw || "http://127.0.0.1:9187/";
}

export async function checkEgressHealth(): Promise<EgressHealth> {
  const healthUrl = egressHealthUrl();
  if (!healthUrl) return { online: null, healthUrl: null };
  try {
    const res = await fetch(healthUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    // Another service (e.g. a web server) on the same port would answer 200
    // with HTML, so only a JSON status body counts as Egress being up.
    const isJson = (res.headers.get("content-type") ?? "").includes(
      "application/json",
    );
    if (!res.ok || !isJson) return { online: false, healthUrl };
    try {
      JSON.parse(await res.text());
    } catch {
      return { online: false, healthUrl };
    }
    return { online: true, healthUrl };
  } catch {
    return { online: false, healthUrl };
  }
}

export async function activeLiveStream(meetingId: string) {
  return db.query.liveStreams.findFirst({
    where: and(
      eq(liveStreams.meetingId, meetingId),
      inArray(liveStreams.status, ACTIVE_STATUSES),
    ),
    orderBy: [desc(liveStreams.createdAt)],
  });
}

export async function latestLiveStream(meetingId: string) {
  return db.query.liveStreams.findFirst({
    where: eq(liveStreams.meetingId, meetingId),
    orderBy: [desc(liveStreams.createdAt)],
  });
}

export async function startMeetingLiveStream(opts: {
  meetingId: string;
  streamKey: string;
  rtmpUrl?: string | null;
  startedBy?: string | null;
}): Promise<Result<{ stream: LiveStreamRow }>> {
  const config = await resolveLiveStreamConfig();
  if (!config.enabled) {
    return { ok: false, error: "live_disabled", status: 403 };
  }

  const streamKey = opts.streamKey.trim();
  if (!isValidStreamKey(streamKey)) {
    return { ok: false, error: "invalid_stream_key", status: 400 };
  }
  const rtmp = checkRtmpUrl(opts.rtmpUrl);
  if (!rtmp.ok) {
    return { ok: false, error: rtmp.error, status: 400 };
  }
  const rtmpUrl = rtmp.url;

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, opts.meetingId),
  });
  if (!meeting || meeting.status !== "active") {
    return { ok: false, error: "meeting_not_active", status: 409 };
  }
  if (!meetingLiveStreamAllowed(meeting)) {
    return { ok: false, error: "live_not_allowed", status: 403 };
  }

  const existing = await activeLiveStream(opts.meetingId);
  if (existing) {
    return { ok: true, stream: existing };
  }

  const health = await checkEgressHealth();
  if (health.online === false) {
    return { ok: false, error: "egress_offline", status: 503 };
  }

  const cap = maxConcurrentLiveStreams();
  const admission = await db.transaction(
    async (tx): Promise<
      | { row: LiveStreamRow; started: boolean }
      | { error: "live_limit_reached" | "egress_offline" }
    > => {
      // Count + insert must be atomic, or simultaneous starts all see a free
      // slot (and the same meeting can get two rows). Held until commit.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${LIVE_START_LOCK}))`,
      );

      const inFlight = await tx.query.liveStreams.findFirst({
        where: and(
          eq(liveStreams.meetingId, opts.meetingId),
          inArray(liveStreams.status, ACTIVE_STATUSES),
        ),
        orderBy: [desc(liveStreams.createdAt)],
      });
      if (inFlight) return { row: inFlight, started: false };

      if (cap !== null) {
        let running: number;
        try {
          running = await countRunningLiveStreams(tx);
        } catch (err) {
          // Without knowing how many are running, refusing is the safe side.
          console.error(
            "[openmeet] live stream concurrency check failed",
            redactRtmp(err instanceof Error ? err.message : String(err)),
          );
          return { error: "egress_offline" };
        }
        if (running >= cap) return { error: "live_limit_reached" };
      }

      const [inserted] = await tx
        .insert(liveStreams)
        .values({
          meetingId: opts.meetingId,
          status: "starting",
          startedBy: opts.startedBy ?? null,
          startedAt: new Date(),
        })
        .returning();
      return { row: inserted, started: true };
    },
  );

  if ("error" in admission) {
    return admission.error === "live_limit_reached"
      ? { ok: false, error: "live_limit_reached", status: 429 }
      : { ok: false, error: "egress_offline", status: 503 };
  }
  if (!admission.started) {
    return { ok: true, stream: admission.row };
  }
  const row = admission.row;

  try {
    const locale = await liveViewLocale();
    const client = getEgressClient();
    const info = await client.startRoomCompositeEgress(
      meeting.livekitRoomName,
      new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [`${rtmpUrl}/${streamKey}`],
      }),
      {
        customBaseUrl: `${liveViewBaseUrl()}/${locale}/live-view/${meeting.id}`,
        encodingOptions:
          config.quality === "1080p"
            ? EncodingOptionsPreset.H264_1080P_30
            : EncodingOptionsPreset.H264_720P_30,
      },
    );
    const [updated] = await db
      .update(liveStreams)
      .set({ egressId: info.egressId, status: statusFromEgress(info.status) })
      .where(eq(liveStreams.id, row.id))
      .returning();
    return { ok: true, stream: updated ?? row };
  } catch (err) {
    const message = redactRtmp(err instanceof Error ? err.message : String(err));
    console.error("[openmeet] live stream egress start failed", message);
    await db
      .update(liveStreams)
      .set({ status: "failed", error: message, endedAt: new Date() })
      .where(eq(liveStreams.id, row.id));
    return {
      ok: false,
      error: "egress_start_failed",
      status: 502,
      detail: message,
    };
  }
}

export async function stopMeetingLiveStream(opts: {
  meetingId: string;
}): Promise<Result<{ stream: LiveStreamRow | null }>> {
  const row = await activeLiveStream(opts.meetingId);
  if (!row) return { ok: true, stream: null };

  if (!row.egressId) {
    const [ended] = await db
      .update(liveStreams)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(liveStreams.id, row.id))
      .returning();
    return { ok: true, stream: ended ?? row };
  }

  if (row.status === "ending") return { ok: true, stream: row };

  try {
    await getEgressClient().stopEgress(row.egressId);
    const [updated] = await db
      .update(liveStreams)
      .set({ status: "ending" })
      .where(eq(liveStreams.id, row.id))
      .returning();
    return { ok: true, stream: updated ?? row };
  } catch (err) {
    const message = redactRtmp(err instanceof Error ? err.message : String(err));
    console.error("[openmeet] live stream egress stop failed", message);
    // Egress already gone (crashed / room closed): close the row anyway.
    const [failed] = await db
      .update(liveStreams)
      .set({ status: "ended", error: message, endedAt: new Date() })
      .where(eq(liveStreams.id, row.id))
      .returning();
    return { ok: true, stream: failed ?? row };
  }
}

function statusFromEgress(status: EgressStatus): LiveStreamStatus {
  switch (status) {
    case EgressStatus.EGRESS_ACTIVE:
      return "live";
    case EgressStatus.EGRESS_ENDING:
      return "ending";
    case EgressStatus.EGRESS_COMPLETE:
      return "ended";
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_ABORTED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      return "failed";
    default:
      return "starting";
  }
}

async function applyEgressInfo(row: LiveStreamRow, info: EgressInfo) {
  const status = statusFromEgress(info.status);
  if (status === row.status) return row;
  const finished = status === "ended" || status === "failed";
  const [updated] = await db
    .update(liveStreams)
    .set({
      status,
      ...(finished ? { endedAt: new Date() } : {}),
      ...(status === "failed"
        ? {
            error: redactRtmp(
              info.error || `egress_status_${EgressStatus[info.status]}`,
            ),
          }
        : {}),
    })
    .where(eq(liveStreams.id, row.id))
    .returning();
  return updated ?? row;
}

/** Returns true when the egress belonged to a live stream. */
export async function handleLiveStreamEgressWebhook(info: EgressInfo) {
  if (!info.egressId) return false;
  const row = await db.query.liveStreams.findFirst({
    where: eq(liveStreams.egressId, info.egressId),
  });
  if (!row) return false;
  await applyEgressInfo(row, info);
  return true;
}

/**
 * Poll Egress directly — LiveKit webhooks may not be routed to this app
 * (shared livekit.yaml), so the status endpoint reconciles on read.
 */
export async function refreshLiveStreamStatus(
  meetingId: string,
): Promise<LiveStreamRow | null> {
  const row = await activeLiveStream(meetingId);
  if (!row?.egressId) return row ?? null;

  try {
    const [info] = await getEgressClient().listEgress({
      egressId: row.egressId,
    });
    if (info) {
      const updated = await applyEgressInfo(row, info);
      return ACTIVE_STATUSES.includes(updated.status as LiveStreamStatus)
        ? updated
        : null;
    }
    const age = Date.now() - (row.startedAt ?? row.createdAt).getTime();
    if (age > ORPHAN_AFTER_MS) {
      await db
        .update(liveStreams)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(liveStreams.id, row.id));
      return null;
    }
  } catch (err) {
    console.warn(
      "[openmeet] live stream status refresh failed",
      redactRtmp(err instanceof Error ? err.message : String(err)),
    );
  }
  return row;
}

export function serializeLiveStream(row: LiveStreamRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as LiveStreamStatus,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}
