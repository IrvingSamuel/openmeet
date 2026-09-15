"use client";

import { useEffect, useState } from "react";
import { Badge, Skeleton } from "@/components/ui/Surface";
import { cn } from "@/lib/utils";

export type OpsStats = {
  version: string;
  generatedAt: string;
  health: { postgres: boolean; livekit: boolean; agent: boolean };
  now: {
    meetingsActive: number;
    participantsConnected: number;
    livekitRooms: number | null;
  };
  users: {
    total: number;
    byCreatedVia: Record<string, number>;
    series30d: Array<{ date: string; count: number }>;
  };
  meetings: {
    endedToday: number;
    ended7d: number;
    ended30d: number;
    series30d: Array<{ date: string; count: number }>;
  };
  recordings: {
    byStatus: Record<string, number>;
    totalBytes: number;
  };
  llm: Array<{
    feature: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }>;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function Sparkline({
  series,
  className,
}: {
  series: Array<{ date: string; count: number }>;
  className?: string;
}) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const w = 320;
  const h = 72;
  const pad = 4;
  const points = series
    .map((s, i) => {
      const x = pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2);
      const y = h - pad - (s.count / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `M ${pad},${h - pad} L ${points
    .split(" ")
    .map((p) => p)
    .join(" L ")} L ${w - pad},${h - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-20 w-full", className)}
      role="img"
      aria-hidden
    >
      <path
        d={area}
        className="fill-[color-mix(in_srgb,var(--brand-primary)_18%,transparent)]"
      />
      <polyline
        fill="none"
        stroke="var(--brand-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          ok ? "bg-emerald-400" : "bg-rose-400",
        )}
        aria-hidden
      />
      <span className="text-ink">{label}</span>
      <span className="text-ink-faint">{ok ? "ok" : "down"}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function OpsOverview({
  onLoadedVersion,
}: {
  onLoadedVersion?: (version: string) => void;
}) {
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const res = await fetch("/api/ops/stats");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "stats_failed");
        if (cancelled) return;
        setStats(data as OpsStats);
        setError(null);
        onLoadedVersion?.(data.version);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "stats_failed");
        }
      }
    }

    void load();
    timer = setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [onLoadedVersion]);

  if (error && !stats) {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
        Failed to load ops stats: {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const healthAll =
    stats.health.postgres && stats.health.livekit && stats.health.agent;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Platform health</h2>
          <p className="text-sm text-ink-muted">
            Live snapshot · refreshed every 30s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={healthAll ? "success" : "danger"}>
            {healthAll ? "Healthy" : "Degraded"}
          </Badge>
          <Badge>v{stats.version}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-line bg-white/[0.03] px-4 py-3">
        <HealthDot ok={stats.health.postgres} label="Postgres" />
        <HealthDot ok={stats.health.livekit} label="LiveKit" />
        <HealthDot ok={stats.health.agent} label="Agent" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Meetings now"
          value={stats.now.meetingsActive}
          hint={
            stats.now.livekitRooms != null
              ? `LiveKit rooms: ${stats.now.livekitRooms}`
              : "LiveKit room count unavailable"
          }
        />
        <StatCard
          label="Participants now"
          value={stats.now.participantsConnected}
        />
        <StatCard
          label="Users"
          value={stats.users.total}
          hint={Object.entries(stats.users.byCreatedVia)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        />
        <StatCard
          label="Meetings ended"
          value={stats.meetings.endedToday}
          hint={`7d: ${stats.meetings.ended7d} · 30d: ${stats.meetings.ended30d}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">New users · 30d</h3>
            <span className="text-xs text-ink-faint">
              {stats.users.series30d.reduce((a, b) => a + b.count, 0)} total
            </span>
          </div>
          <Sparkline series={stats.users.series30d} className="mt-3" />
        </div>
        <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">
              Meetings ended · 30d
            </h3>
            <span className="text-xs text-ink-faint">
              {stats.meetings.ended30d} total
            </span>
          </div>
          <Sparkline series={stats.meetings.series30d} className="mt-3" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
          <h3 className="text-sm font-semibold text-ink">Recordings</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Storage {formatBytes(stats.recordings.totalBytes)}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
            {Object.keys(stats.recordings.byStatus).length === 0 ? (
              <li>No recordings yet</li>
            ) : (
              Object.entries(stats.recordings.byStatus).map(([status, n]) => (
                <li key={status} className="flex justify-between gap-3">
                  <span>{status}</span>
                  <span className="text-ink">{n}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white/[0.04] p-4">
          <h3 className="text-sm font-semibold text-ink">LLM usage · 30d</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
            {stats.llm.length === 0 ? (
              <li>No LLM calls recorded</li>
            ) : (
              stats.llm.map((row) => (
                <li key={row.feature} className="flex justify-between gap-3">
                  <span>{row.feature}</span>
                  <span className="text-ink">
                    {row.calls} calls · {row.inputTokens + row.outputTokens} tok
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
