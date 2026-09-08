"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type LocalTask = {
  id: string;
  title: string;
  assigneeHint: string | null;
  status: "pending" | "done";
};

export function normalizeActionItemStatus(status: string): "pending" | "done" {
  if (status === "done" || status === "created") return "done";
  return "pending";
}

type MeetingTasksTabProps = {
  tasks: LocalTask[];
  summaryStatus: string;
  canEdit: boolean;
  toggleError: string | null;
  onToggle: (id: string, next: "pending" | "done") => void;
};

export function MeetingTasksTab({
  tasks,
  summaryStatus,
  canEdit,
  toggleError,
  onToggle,
}: MeetingTasksTabProps) {
  const t = useTranslations("summary");
  const tMeta = useTranslations("meta");

  const doneCount = tasks.filter((task) => task.status === "done").length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
          {t("suggestedTasks")}
        </h2>
        {tasks.length > 0 ? (
          <span className="text-xs text-ink-faint">
            {t("tasksProgress", { done: doneCount, total: tasks.length })}
          </span>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-2xl border border-line bg-white/[0.02] px-4 py-3 text-sm text-ink-faint">
          {t("tasksSignInHint")}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-line px-4 py-8 text-center text-sm text-ink-faint">
          {summaryStatus === "ready"
            ? t("noTasksReady")
            : tMeta("extractingActionItems")}
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={cn(
                "rounded-2xl border px-4 py-3 transition-colors",
                task.status === "done"
                  ? "border-line bg-white/[0.02] opacity-75"
                  : "border-brand-primary/30 bg-white/[0.04]",
              )}
            >
              <label
                className={cn(
                  "flex items-start gap-3",
                  canEdit ? "cursor-pointer" : "cursor-default",
                )}
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  disabled={!canEdit}
                  onChange={() =>
                    onToggle(
                      task.id,
                      task.status === "done" ? "pending" : "done",
                    )
                  }
                  className="mt-1"
                  aria-label={t("toggleTaskAria", { title: task.title })}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm text-ink",
                      task.status === "done" && "line-through text-ink-faint",
                    )}
                  >
                    {task.title}
                  </p>
                  {task.assigneeHint ? (
                    <p className="mt-1 text-xs text-ink-faint">
                      {t("assigneeLabel")}: {task.assigneeHint}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-ink-faint">
                  {task.status === "done" ? t("taskDone") : t("taskPending")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {toggleError ? (
        <p className="text-sm text-rose-300">{toggleError}</p>
      ) : null}
    </section>
  );
}
