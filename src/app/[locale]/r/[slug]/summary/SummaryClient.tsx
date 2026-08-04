"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Aurora } from "@/components/motion/primitives";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { IconCopy, IconDownload, IconFileText, IconLink } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { SuggestedAction } from "@/lib/meeting-summary";

type ActionItemRow = {
  id: string;
  title: string;
  assigneeHint: string | null;
  chronosBoardId: string | null;
  status: string;
  raw: SuggestedAction | null;
};

type RecordingRow = {
  id: string;
  status: string;
  engine: string;
  mimeType: string | null;
  bytes: number | null;
  downloadUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

type BoardOption = {
  board_id?: string;
  id?: string;
  name?: string;
  title?: string;
};

type MemberOption = { id: number; name?: string; email?: string };

type EditableTask = {
  key: string;
  actionItemId?: string;
  included: boolean;
  title: string;
  description: string;
  boardId: string;
  dueDate: string;
  priority: "low" | "medium" | "high" | "critical";
  assigneeId: number | "";
  assigneeHint: string;
  checklistText: string;
};

type TranscriptSegment = {
  id: string;
  speakerLabel: string;
  text: string;
  createdAt?: string;
};

function boardIdOf(b: BoardOption) {
  return b.board_id || b.id || "";
}

function boardNameOf(b: BoardOption) {
  return b.name || b.title || boardIdOf(b);
}

/** Avoid duplicating the raw-transcript heading when offline fallback already embeds it. */
function stripEmbeddedTranscript(md: string, rawHeading: string) {
  const escaped = rawHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idx = md.search(new RegExp(`^${escaped}\\s*$`, "im"));
  if (idx < 0) return md.trim();
  return md.slice(0, idx).trim();
}

function transcriptAsMarkdown(
  segments: TranscriptSegment[],
  emptyLabel: string,
) {
  if (segments.length === 0) return emptyLabel;
  return segments.map((s) => `**${s.speakerLabel}:** ${s.text}`).join("\n\n");
}

function buildExportMarkdown(
  summary: string,
  segments: TranscriptSegment[],
  slug: string,
  labels: {
    title: string;
    unavailable: string;
    rawHeading: string;
    noSegments: string;
  },
) {
  const body = stripEmbeddedTranscript(summary, labels.rawHeading);
  const parts = [
    labels.title,
    "",
    body || labels.unavailable,
    "",
    labels.rawHeading,
    "",
    transcriptAsMarkdown(segments, labels.noSegments),
    "",
  ];
  return parts.join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MeetingSummaryPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("summary");
  const tCommon = useTranslations("common");
  const tMeta = useTranslations("meta");
  const slug = params.slug;
  const meetingId = search.get("meetingId");

  const [status, setStatus] = useState<string>("pending");
  const [markdown, setMarkdown] = useState<string>("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [membersByBoard, setMembersByBoard] = useState<
    Record<string, MemberOption[]>
  >({});
  const [defaultBoardId, setDefaultBoardId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const [billingWarning, setBillingWarning] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);

  const loadMembers = useCallback(async (boardId: string) => {
    if (!boardId) return;
    setMembersByBoard((prev) =>
      prev[boardId] ? prev : { ...prev, [boardId]: [] },
    );
    const res = await fetch(
      `/api/chronos/boards?boardId=${encodeURIComponent(boardId)}`,
    );
    if (res.status === 401) {
      setReauthNeeded(true);
      return;
    }
    if (res.status === 400) {
      setReauthNeeded(true);
      return;
    }
    if (!res.ok) return;
    const json = (await res.json()) as { members?: MemberOption[] };
    setMembersByBoard((prev) => ({
      ...prev,
      [boardId]: json.members ?? [],
    }));
  }, []);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;

    async function loadTranscript() {
      const res = await fetch(
        `/api/transcripts?meetingId=${encodeURIComponent(meetingId!)}`,
      ).catch(() => null);
      if (!res?.ok || cancelled) return;
      const json = (await res.json()) as { segments?: TranscriptSegment[] };
      if (!cancelled) setSegments(json.segments ?? []);
    }

    void loadTranscript();
    // Keep polling while summary is still generating (late segments may arrive).
    if (status === "ready") {
      return () => {
        cancelled = true;
      };
    }
    const t = setInterval(() => void loadTranscript(), 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [meetingId, status]);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    fetch(`/api/meetings/${meetingId}/recording`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((json) => {
        if (cancelled || !json) return;
        const rows = (json.recordings ?? []) as RecordingRow[];
        setRecordings(rows.filter((r) => r.status === "ready"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [meetingId, status]);

  useEffect(() => {
    if (!shareHint) return;
    const t = setTimeout(() => setShareHint(null), 2500);
    return () => clearTimeout(t);
  }, [shareHint]);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    let tries = 0;

    async function tick() {
      tries += 1;
      const res = await fetch(`/api/meetings/summary?meetingId=${meetingId}`);
      const json = await res.json();
      if (cancelled) return;

      setStatus(json.status || "pending");
      const md =
        json.summary?.summaryMarkdown || json.summaryMarkdown || "";
      if (md) setMarkdown(md);
      if (
        json.billingDepleted ||
        (typeof md === "string" && md.includes("créditos Gemini esgotados"))
      ) {
        setBillingWarning(true);
      }

      if (json.status === "pending" || json.status === "failed") {
        const gen = await fetch("/api/meetings/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId }),
        }).catch(() => null);
        if (gen) {
          const genJson = await gen.json().catch(() => ({}));
          if (genJson.billingDepleted) setBillingWarning(true);
          if (genJson.summaryMarkdown) setMarkdown(genJson.summaryMarkdown);
          if (genJson.status === "ready") {
            setStatus("ready");
            // fall through to load action items on next tick
          }
        }
      }

      if (json.status === "ready" && Array.isArray(json.actionItems)) {
        const roomRes = await fetch(`/api/rooms/${slug}`);
        const roomJson = roomRes.ok ? await roomRes.json() : null;
        const roomBoard = roomJson?.room?.boardId || "";
        if (!cancelled) setDefaultBoardId(roomBoard);

        setTasks(
          (json.actionItems as ActionItemRow[]).map((item, i) => {
            const raw = (item.raw || {}) as SuggestedAction;
            return {
              key: item.id || `t-${i}`,
              actionItemId: item.id,
              included: item.status !== "created",
              title: item.title,
              description: raw.description || "",
              boardId: item.chronosBoardId || roomBoard || "",
              dueDate: raw.dueDateHint || "",
              priority: raw.priority || "medium",
              assigneeId: "" as const,
              assigneeHint: item.assigneeHint || raw.assigneeHint || "",
              checklistText: (raw.checklist || []).join("\n"),
            };
          }),
        );
        return;
      }

      if (tries < 40 && json.status !== "ready") {
        setTimeout(tick, 2500);
      }
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [meetingId, slug]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chronos/boards")
      .then(async (res) => {
        if (res.status === 401 || res.status === 400) {
          if (!cancelled) setReauthNeeded(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { boards?: BoardOption[] };
        if (!cancelled) setBoards(json.boards ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ids = new Set(
      tasks.map((t) => t.boardId).filter(Boolean) as string[],
    );
    if (defaultBoardId) ids.add(defaultBoardId);
    for (const id of ids) void loadMembers(id);
  }, [tasks, defaultBoardId, loadMembers]);

  const selectedCount = useMemo(
    () => tasks.filter((t) => t.included).length,
    [tasks],
  );

  const reportMarkdown = useMemo(
    () => stripEmbeddedTranscript(markdown, t("exportRawHeading")),
    [markdown, t],
  );

  const exportMarkdown = useMemo(
    () =>
      buildExportMarkdown(markdown, segments, slug, {
        title: t("exportTitle", { slug }),
        unavailable: t("exportUnavailable"),
        rawHeading: t("exportRawHeading"),
        noSegments: t("exportNoSegments"),
      }),
    [markdown, segments, slug, t],
  );

  function downloadMarkdown() {
    if (!exportMarkdown.trim()) return;
    downloadTextFile(`resumo-${slug}.md`, exportMarkdown);
  }

  async function shareSummary() {
    const url =
      typeof window !== "undefined" ? window.location.href : "";
    const title = t("shareTitle", { slug });
    setShareHint(null);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          text: reportMarkdown.slice(0, 500) || title,
          url,
        });
        setShareHint(tCommon("toast.shared"));
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareHint(tCommon("toast.linkCopiedShort"));
        return;
      }
      setShareHint(tCommon("toast.shareFailed"));
    } catch (err) {
      // User cancelled share sheet — ignore AbortError
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareHint(tCommon("toast.linkCopiedShort"));
      } catch {
        setShareHint(tCommon("toast.shareFailedGeneric"));
      }
    }
  }

  async function pushTasks() {
    if (!meetingId) return;
    setPushing(true);
    setError(null);
    setPushResult(null);
    try {
      const payload = {
        meetingId,
        tasks: tasks
          .filter((t) => t.included)
          .map((t) => ({
            actionItemId: t.actionItemId,
            title: t.title,
            description: t.description || undefined,
            boardId: t.boardId || defaultBoardId,
            dueDate: t.dueDate || null,
            priority: t.priority,
            assigneeIds:
              typeof t.assigneeId === "number" ? [t.assigneeId] : undefined,
            assigneeHint: t.assigneeHint || undefined,
            checklist: t.checklistText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          })),
      };
      if (payload.tasks.some((t) => !t.boardId)) {
        setError(t("chooseBoard"));
        return;
      }
      const res = await fetch("/api/meetings/action-items/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.status === 401 && json.error === "reauth_required") {
        setReauthNeeded(true);
        setError(t("mcpTokenRequired"));
        return;
      }
      if (res.status === 400 && json.error === "mcp_token_required") {
        setReauthNeeded(true);
        setError(t("mcpTokenRequired"));
        return;
      }
      if (!res.ok) {
        setError(json.error || t("pushFailed"));
        return;
      }
      const ok = (json.results || []).filter((r: { ok: boolean }) => r.ok)
        .length;
      const fail = (json.results || []).length - ok;
      setPushResult(
        fail
          ? t("pushPartial", { ok, fail })
          : t("pushSuccess", { count: ok }),
      );
      setTasks((prev) =>
        prev.map((t) => (t.included ? { ...t, included: false } : t)),
      );
    } catch {
      setError(t("pushNetworkFailed"));
    } finally {
      setPushing(false);
    }
  }

  if (!meetingId) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">{t("noMeetingId")}</h1>
        <Button className="mt-6" onClick={() => router.push("/dashboard")}>
          {tCommon("actions.goToDashboard")}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {status === "ready"
              ? t("statusReady")
              : status === "running"
                ? t("statusRunning")
                : status === "failed"
                  ? t("statusFailed")
                  : t("statusPending")}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          {tCommon("actions.goToDashboardAlt")}
        </Button>
      </div>

      {reauthNeeded ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {t("mcpNeeded")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              window.location.href = "/api/auth/login";
            }}
          >
            {t("mcpLink")}
          </button>
        </div>
      ) : null}

      {billingWarning ? (
        <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {t("billingWarning")}{" "}
          <a
            href="https://ai.studio/projects"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t("billingReload")}
          </a>
          {t("billingAfter")}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
                {t("report")}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!markdown}
                  icon={<IconFileText />}
                  onClick={downloadMarkdown}
                >
                  {t("downloadMd")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!markdown && !meetingId}
                  icon={<IconLink />}
                  onClick={() => void shareSummary()}
                >
                  {t("share")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!exportMarkdown}
                  icon={<IconCopy />}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(exportMarkdown);
                      setShareHint(tCommon("toast.markdownCopied"));
                    } catch {
                      setShareHint(tCommon("toast.copyFailed"));
                    }
                  }}
                  aria-label={t("copyMarkdown")}
                >
                  {tCommon("actions.copy")}
                </Button>
              </div>
            </div>
            {shareHint ? (
              <p className="mt-2 text-xs text-emerald-300">{shareHint}</p>
            ) : null}
            {reportMarkdown ? (
              <article className="prose prose-invert prose-sm mt-4 max-w-none text-ink-muted prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-ink prose-strong:text-ink prose-li:marker:text-ink-faint">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {reportMarkdown}
                </ReactMarkdown>
              </article>
            ) : (
              <p className="mt-6 text-sm text-ink-faint">{tMeta("waitingContent")}</p>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-white/[0.03] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
              {t("recordingsHeading")}
            </h2>
            {recordings.length === 0 ? (
              <p className="mt-4 text-sm text-ink-faint">{t("recordingsEmpty")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {recordings.map((rec) => (
                  <li
                    key={rec.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-black/20 px-3 py-2.5 text-sm"
                  >
                    <span className="text-ink-muted">
                      {rec.engine} ·{" "}
                      {rec.bytes
                        ? `${Math.round(rec.bytes / 1024 / 1024)} MB`
                        : rec.mimeType || "video"}
                    </span>
                    {rec.downloadUrl ? (
                      <a href={rec.downloadUrl} className="inline-flex">
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<IconDownload className="h-3.5 w-3.5" />}
                        >
                          {t("downloadRecording")}
                        </Button>
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-white/[0.03] p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
                {t("rawTranscript")}
              </h2>
              <span className="text-xs text-ink-faint">
                {tCommon("segmentCount", { count: segments.length })}
              </span>
            </div>
            {segments.length === 0 ? (
              <p className="mt-4 text-sm text-ink-faint">
                {status === "ready"
                  ? t("noSegmentsReady")
                  : tMeta("waitingSegments")}
              </p>
            ) : (
              <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {segments.map((s) => (
                  <div key={s.id} className="text-sm leading-relaxed">
                    <span className="font-medium text-ink">{s.speakerLabel}</span>
                    <span className="text-ink-faint"> · </span>
                    <span className="text-ink-muted">{s.text}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
              {t("suggestedTasks")}
            </h2>
            <span className="text-xs text-ink-faint">
              {tCommon("selectedCount", { count: selectedCount })}
            </span>
          </div>

          {tasks.length === 0 ? (
            <p className="rounded-2xl border border-line px-4 py-8 text-center text-sm text-ink-faint">
              {status === "ready"
                ? t("noTasksReady")
                : tMeta("extractingActionItems")}
            </p>
          ) : (
            tasks.map((task, idx) => (
              <TaskCard
                key={task.key}
                task={task}
                boards={boards}
                members={membersByBoard[task.boardId] || []}
                onChange={(next) => {
                  setTasks((prev) =>
                    prev.map((t, i) => (i === idx ? next : t)),
                  );
                  if (next.boardId) void loadMembers(next.boardId);
                }}
              />
            ))
          )}

          {error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : null}
          {pushResult ? (
            <p className="text-sm text-emerald-300">{pushResult}</p>
          ) : null}

          <Button
            size="lg"
            className="w-full"
            loading={pushing}
            disabled={selectedCount === 0 || status !== "ready"}
            onClick={() => void pushTasks()}
          >
            {t("createInChronos", { count: selectedCount || 0 })}
          </Button>
        </section>
      </div>
    </Shell>
  );
}

function TaskCard({
  task,
  boards,
  members,
  onChange,
}: {
  task: EditableTask;
  boards: BoardOption[];
  members: MemberOption[];
  onChange: (t: EditableTask) => void;
}) {
  const t = useTranslations("summary");
  const tCommon = useTranslations("common");
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        task.included
          ? "border-brand-primary/40 bg-white/[0.04]"
          : "border-line bg-transparent opacity-60",
      )}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.included}
          onChange={(e) => onChange({ ...task, included: e.target.checked })}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <input
            value={task.title}
            onChange={(e) => onChange({ ...task, title: e.target.value })}
            className="w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand-primary"
            aria-label={t("taskTitleAria")}
          />
          <textarea
            value={task.description}
            onChange={(e) =>
              onChange({ ...task, description: e.target.value })
            }
            rows={2}
            placeholder={t("descriptionPlaceholder")}
            className="w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-ink-faint">
              {t("board")}
              <select
                value={task.boardId}
                onChange={(e) =>
                  onChange({ ...task, boardId: e.target.value, assigneeId: "" })
                }
                className="mt-1 w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-ink"
              >
                <option value="">{tCommon("actions.select")}</option>
                {boards.map((b) => (
                  <option key={boardIdOf(b)} value={boardIdOf(b)}>
                    {boardNameOf(b)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-faint">
              {t("dueDate")}
              <input
                type="date"
                value={task.dueDate}
                onChange={(e) =>
                  onChange({ ...task, dueDate: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink-faint">
              {t("assignee")}
              <select
                value={task.assigneeId === "" ? "" : String(task.assigneeId)}
                onChange={(e) =>
                  onChange({
                    ...task,
                    assigneeId: e.target.value
                      ? Number(e.target.value)
                      : "",
                  })
                }
                className="mt-1 w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-ink"
              >
                <option value="">
                  {task.assigneeHint
                    ? t("assigneeHint", { hint: task.assigneeHint })
                    : tCommon("actions.none")}
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email || m.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-faint">
              {t("priority")}
              <select
                value={task.priority}
                onChange={(e) =>
                  onChange({
                    ...task,
                    priority: e.target.value as EditableTask["priority"],
                  })
                }
                className="mt-1 w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-ink"
              >
                <option value="low">{tCommon("priority.low")}</option>
                <option value="medium">{tCommon("priority.medium")}</option>
                <option value="high">{tCommon("priority.high")}</option>
                <option value="critical">{tCommon("priority.critical")}</option>
              </select>
            </label>
          </div>
          <label className="block text-xs text-ink-faint">
            {t("checklist")}
            <textarea
              value={task.checklistText}
              onChange={(e) =>
                onChange({ ...task, checklistText: e.target.value })
              }
              rows={3}
              className="mt-1 w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand-primary"
            />
          </label>
        </div>
      </label>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen px-5 py-10">
      <Aurora intensity={0.45} />
      <div className="relative mx-auto max-w-6xl">
        <LogoMark className="mb-6 h-9 w-9" />
        {children}
      </div>
    </div>
  );
}
