"use client";

import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Aurora,
  PageTransition,
  Reveal,
} from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { OpsOverview } from "@/components/ops/OpsOverview";
import { cn } from "@/lib/utils";

type TenantRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdVia: string;
  externalId: string | null;
  createdAt: string;
  roomCount: number;
  meetingCount: number;
  activeMeetingCount: number;
};

type TenantDetail = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    role: string;
    createdVia: string;
    externalId: string | null;
    mustChangePassword: boolean;
    createdAt: string;
    updatedAt: string;
  };
  counts: { rooms: number; meetings: number; activeMeetings: number };
  brand: {
    wordmark: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    background: string | null;
    themePreset: string | null;
  } | null;
  mediaPrefs: {
    videoEffect: string;
    blurRadius: number;
    virtualBackgroundUrl: string | null;
    noiseSuppression: boolean;
    echoCancellation: boolean;
    autoGainControl: boolean;
  } | null;
  oauth: Array<{
    id: string;
    provider: string;
    subject: string;
    createdAt: string;
  }>;
};

type RoomRow = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  accessPolicy: string;
  boardId: string | null;
  createdAt: string;
};

type MeetingRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  summaryStatus: string;
  startedAt: string;
  endedAt: string | null;
  livekitRoomName: string;
  hasSummary: boolean;
};

type MeetingDetail = {
  meeting: MeetingRow & {
    accessPolicy: string;
    boardId: string | null;
  };
  summary: {
    id: string;
    markdown: string;
    model: string | null;
    createdAt: string;
  } | null;
  participants: Array<{
    id: string;
    displayName: string;
    role: string;
    livekitIdentity: string;
    joinedAt: string | null;
    leftAt: string | null;
    connectedAt: string | null;
  }>;
  recordings: Array<{
    id: string;
    status: string;
    engine: string;
    storageBackend: string;
    bytes: number | null;
    mimeType: string | null;
    error: string | null;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
  }>;
  transcriptCount: number;
};

type View =
  | { kind: "overview" }
  | { kind: "list" }
  | { kind: "tenant"; id: string }
  | { kind: "meeting"; tenantId: string; meetingId: string };

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function OpsTenantsPage() {
  const locale = useLocale();
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null);
  const [meetingDetail, setMeetingDetail] = useState<MeetingDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((me) => {
        setAllowed(Boolean(me.isLoggedIn && me.isLocalRoot));
      })
      .catch(() => setAllowed(false));
  }, []);

  const loadTenants = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/ops/tenants?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setTenants(data.tenants);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tenants");
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (allowed && view.kind === "list") {
      void loadTenants(q);
    }
  }, [allowed, view.kind]); // eslint-disable-line react-hooks/exhaustive-deps -- search on demand

  const openTenant = useCallback(
    async (id: string) => {
      setView({ kind: "tenant", id });
      setDetail(null);
      setRooms(null);
      setMeetings(null);
      setLoading(true);
      try {
        const [dRes, rRes, mRes] = await Promise.all([
          fetch(`/api/ops/tenants/${id}`),
          fetch(`/api/ops/tenants/${id}/rooms`),
          fetch(`/api/ops/tenants/${id}/meetings?limit=100`),
        ]);
        const [d, r, m] = await Promise.all([
          dRes.json(),
          rRes.json(),
          mRes.json(),
        ]);
        if (!dRes.ok) throw new Error(d.error || "tenant failed");
        setDetail(d);
        setRooms(r.rooms ?? []);
        setMeetings(m.meetings ?? []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load tenant");
        setView({ kind: "list" });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const openMeeting = useCallback(
    async (tenantId: string, meetingId: string) => {
      setView({ kind: "meeting", tenantId, meetingId });
      setMeetingDetail(null);
      setLoading(true);
      try {
        const res = await fetch(
          `/api/ops/tenants/${tenantId}/meetings/${meetingId}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "meeting failed");
        setMeetingDetail(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load meeting");
        setView({ kind: "tenant", id: tenantId });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  async function impersonate(userId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/ops/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "impersonate failed");
      toast.success(`Impersonating ${data.target?.email || userId}`);
      window.location.href = `/${locale}/dashboard`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impersonate failed");
      setBusy(false);
    }
  }

  async function setRole(userId: string, role: "admin" | "user") {
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/tenants/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "role failed");
      toast.success(`Role → ${role}`);
      await openTenant(userId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Role update failed");
    } finally {
      setBusy(false);
    }
  }

  async function endMeeting(tenantId: string, meetingId: string) {
    if (!confirm("End this meeting now?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/ops/tenants/${tenantId}/meetings/${meetingId}/end`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "end failed");
      toast.success(data.alreadyEnded ? "Already ended" : "Meeting ended");
      await openMeeting(tenantId, meetingId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "End failed");
    } finally {
      setBusy(false);
    }
  }

  const title = useMemo(() => {
    if (view.kind === "meeting") return "Meeting";
    if (view.kind === "tenant") return detail?.user.email || "Tenant";
    if (view.kind === "overview") return "Health & metrics";
    return "Tenants";
  }, [view, detail]);

  if (allowed === null) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <Aurora intensity={0.4} />
        <div className="relative mx-auto max-w-4xl px-6 py-20">
          <Skeleton className="h-10 w-48" />
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <Aurora intensity={0.4} />
        <PageTransition className="relative mx-auto max-w-lg px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-ink">Ops — forbidden</h1>
          <p className="mt-2 text-ink-muted">
            Local root admin session required.
          </p>
          <Link href="/dashboard" className="mt-6 inline-block text-brand-primary">
            ← Dashboard
          </Link>
        </PageTransition>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <Aurora intensity={0.45} />
      <PageTransition className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-9" />
            <div>
              <Wordmark className="text-lg" />
              <p className="text-xs uppercase tracking-widest text-ink-muted">
                Internal ops
                {appVersion ? ` · v${appVersion}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                Admin
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">
                Dashboard
              </Button>
            </Link>
          </div>
        </header>

        <Reveal className="mt-8">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={view.kind === "overview" ? "primary" : "ghost"}
              onClick={() => setView({ kind: "overview" })}
            >
              Overview
            </Button>
            <Button
              size="sm"
              variant={
                view.kind === "list" ||
                view.kind === "tenant" ||
                view.kind === "meeting"
                  ? "primary"
                  : "ghost"
              }
              onClick={() => {
                setView({ kind: "list" });
                void loadTenants(q);
              }}
            >
              Tenants
            </Button>
          </div>
        </Reveal>

        <Reveal className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            {view.kind !== "overview" && view.kind !== "list" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (view.kind === "meeting") {
                    void openTenant(view.tenantId);
                  } else {
                    setView({ kind: "list" });
                    void loadTenants(q);
                  }
                }}
              >
                ← Back
              </Button>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {title}
            </h1>
          </div>
        </Reveal>

        {view.kind === "overview" && (
          <section className="mt-6">
            <OpsOverview onLoadedVersion={setAppVersion} />
          </section>
        )}

        {view.kind === "list" && (
          <section className="mt-6 space-y-4">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void loadTenants(q);
              }}
            >
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search email / name / external id"
                className="min-w-[240px] flex-1"
              />
              <Button type="submit" size="sm" loading={loading}>
                Search
              </Button>
            </form>

            <div className="overflow-x-auto rounded-3xl glass">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Rooms</th>
                    <th className="px-4 py-3 font-medium">Meetings</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !tenants ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-ink-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : tenants && tenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-ink-muted">
                        No tenants
                      </td>
                    </tr>
                  ) : (
                    tenants?.map((t) => (
                      <tr
                        key={t.id}
                        className="cursor-pointer border-t border-line/60 hover:bg-white/[0.04]"
                        onClick={() => void openTenant(t.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">
                            {t.name || "—"}
                          </div>
                          <div className="text-ink-muted">{t.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge>{t.role}</Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{t.roomCount}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {t.meetingCount}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {t.activeMeetingCount > 0 ? (
                            <span className="text-amber-300">
                              {t.activeMeetingCount}
                            </span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {fmtDate(t.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view.kind === "tenant" && (
          <section className="mt-6 space-y-6">
            {loading && !detail ? (
              <Skeleton className="h-40 w-full rounded-3xl" />
            ) : detail ? (
              <>
                <div className="rounded-3xl glass p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-ink">
                        {detail.user.name || "—"}
                      </h2>
                      <p className="text-ink-muted">{detail.user.email}</p>
                      <p className="mt-2 text-xs text-ink-muted">
                        id {detail.user.id}
                        {detail.user.externalId
                          ? ` · ext ${detail.user.externalId}`
                          : ""}
                        {` · via ${detail.user.createdVia}`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-ink-muted">
                        <span>{detail.counts.rooms} rooms</span>
                        <span>·</span>
                        <span>{detail.counts.meetings} meetings</span>
                        <span>·</span>
                        <span className="text-amber-300">
                          {detail.counts.activeMeetings} active
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={detail.user.role}
                        disabled={busy}
                        onChange={(e) =>
                          void setRole(
                            detail.user.id,
                            e.target.value as "admin" | "user",
                          )
                        }
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </Select>
                      <Button
                        size="sm"
                        loading={busy}
                        onClick={() => void impersonate(detail.user.id)}
                      >
                        Impersonate
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-line/50 bg-black/20 p-4">
                      <h3 className="text-sm font-semibold text-ink">Brand</h3>
                      {detail.brand ? (
                        <dl className="mt-2 space-y-1 text-sm text-ink-muted">
                          <div>wordmark: {detail.brand.wordmark || "—"}</div>
                          <div>theme: {detail.brand.themePreset || "—"}</div>
                          <div>
                            primary: {detail.brand.primaryColor || "—"}
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm text-ink-muted">None</p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-line/50 bg-black/20 p-4">
                      <h3 className="text-sm font-semibold text-ink">
                        Media prefs
                      </h3>
                      {detail.mediaPrefs ? (
                        <dl className="mt-2 space-y-1 text-sm text-ink-muted">
                          <div>
                            video: {detail.mediaPrefs.videoEffect} (blur{" "}
                            {detail.mediaPrefs.blurRadius})
                          </div>
                          <div>
                            NS {String(detail.mediaPrefs.noiseSuppression)} · EC{" "}
                            {String(detail.mediaPrefs.echoCancellation)} · AGC{" "}
                            {String(detail.mediaPrefs.autoGainControl)}
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm text-ink-muted">Defaults</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl glass p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Rooms ({rooms?.length ?? 0})
                  </h3>
                  <ul className="mt-3 divide-y divide-line/50">
                    {(rooms ?? []).map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium text-ink">{r.title}</span>
                          <span className="ml-2 text-ink-muted">/{r.slug}</span>
                        </div>
                        <Badge>{r.kind}</Badge>
                      </li>
                    ))}
                    {rooms?.length === 0 && (
                      <li className="py-2 text-sm text-ink-muted">No rooms</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-3xl glass p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Meetings ({meetings?.length ?? 0})
                  </h3>
                  <ul className="mt-3 divide-y divide-line/50">
                    {(meetings ?? []).map((m) => (
                      <li
                        key={m.id}
                        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-white/[0.03]"
                        onClick={() => void openMeeting(view.id, m.id)}
                      >
                        <div>
                          <div className="font-medium text-ink">{m.title}</div>
                          <div className="text-xs text-ink-muted">
                            {fmtDate(m.startedAt)} · /{m.slug}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.hasSummary && <Badge>summary</Badge>}
                          <Badge
                            className={cn(
                              m.status === "active" && "!text-amber-200",
                            )}
                          >
                            {m.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                    {meetings?.length === 0 && (
                      <li className="py-2 text-sm text-ink-muted">
                        No meetings
                      </li>
                    )}
                  </ul>
                </div>
              </>
            ) : null}
          </section>
        )}

        {view.kind === "meeting" && (
          <section className="mt-6 space-y-6">
            {loading && !meetingDetail ? (
              <Skeleton className="h-48 w-full rounded-3xl" />
            ) : meetingDetail ? (
              <>
                <div className="rounded-3xl glass p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-ink">
                        {meetingDetail.meeting.title}
                      </h2>
                      <p className="text-sm text-ink-muted">
                        {meetingDetail.meeting.status} · started{" "}
                        {fmtDate(meetingDetail.meeting.startedAt)}
                        {meetingDetail.meeting.endedAt
                          ? ` · ended ${fmtDate(meetingDetail.meeting.endedAt)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {meetingDetail.meeting.livekitRoomName} ·{" "}
                        {meetingDetail.transcriptCount} transcript segments
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={`/${locale}/m/${meetingDetail.meeting.slug}/summary?meetingId=${meetingDetail.meeting.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-brand-primary underline-offset-2 hover:underline"
                        >
                          Open summary page ↗
                        </a>
                      </div>
                    </div>
                    {(meetingDetail.meeting.status === "active" ||
                      meetingDetail.meeting.status === "scheduled") && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busy}
                        onClick={() =>
                          void endMeeting(view.tenantId, view.meetingId)
                        }
                      >
                        End meeting
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl glass p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Participants ({meetingDetail.participants.length})
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {meetingDetail.participants.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-line/40 py-2"
                      >
                        <span className="text-ink">
                          {p.displayName}{" "}
                          <span className="text-ink-muted">({p.role})</span>
                        </span>
                        <span className="text-xs text-ink-muted">
                          {fmtDate(p.joinedAt)}
                          {p.leftAt ? ` → ${fmtDate(p.leftAt)}` : " · in"}
                        </span>
                      </li>
                    ))}
                    {meetingDetail.participants.length === 0 && (
                      <li className="text-ink-muted">No participants</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-3xl glass p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Recordings ({meetingDetail.recordings.length})
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {meetingDetail.recordings.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-line/40 py-2"
                      >
                        <span className="text-ink">
                          {r.status} · {r.engine}/{r.storageBackend}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {r.bytes != null
                            ? `${Math.round(r.bytes / 1024)} KB`
                            : "—"}{" "}
                          · {fmtDate(r.createdAt)}
                        </span>
                      </li>
                    ))}
                    {meetingDetail.recordings.length === 0 && (
                      <li className="text-ink-muted">No recordings</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-3xl glass p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Summary
                  </h3>
                  {meetingDetail.summary ? (
                    <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-sm text-ink">
                      {meetingDetail.summary.markdown}
                    </pre>
                  ) : (
                    <p className="mt-3 text-sm text-ink-muted">
                      No summary yet (status:{" "}
                      {meetingDetail.meeting.summaryStatus})
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </section>
        )}
      </PageTransition>
    </main>
  );
}
