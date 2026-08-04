type McpCallResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

export async function mcpCall(
  accessToken: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<McpCallResult> {
  const url = process.env.CHRONOS_MCP_URL || "https://chronos.com.pt/mcp";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const json = (await res.json()) as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
    error?: { message?: string };
  };
  if (res.status === 403) {
    const msg = json.error?.message || "";
    if (/insufficient_scope|chronos:mcp/i.test(msg)) {
      return { ok: false, error: "reauth_required" };
    }
  }
  if (!res.ok || json.error) {
    return { ok: false, error: json.error?.message || `HTTP ${res.status}` };
  }
  if (json.result?.isError) {
    return { ok: false, error: json.result.content?.[0]?.text || "tool error" };
  }
  const text = json.result?.content?.[0]?.text;
  try {
    return { ok: true, result: text ? JSON.parse(text) : json.result };
  } catch {
    return { ok: true, result: text ?? json.result };
  }
}

export type CreateBoardTaskOpts = {
  description?: string;
  dueDate?: string | null;
  priority?: "low" | "medium" | "high" | "critical";
  assigneeIds?: number[];
  checklist?: string[];
  inBacklog?: boolean;
};

export async function createBoardTask(
  accessToken: string,
  boardId: string,
  title: string,
  opts?: CreateBoardTaskOpts,
) {
  const created = await mcpCall(accessToken, "board_tasks_create", {
    board_id: boardId,
    title,
    description: opts?.description,
    due_date: opts?.dueDate || undefined,
    priority: opts?.priority,
    assignee_ids: opts?.assigneeIds?.length ? opts.assigneeIds : undefined,
    in_backlog: opts?.inBacklog,
  });
  if (!created.ok) return created;

  const result = created.result as { id?: string; task_id?: string } | null;
  const taskId = result?.id || result?.task_id;
  if (!taskId) return created;

  if (opts?.assigneeIds?.length) {
    await mcpCall(accessToken, "board_tasks_assign", {
      board_id: boardId,
      task_id: taskId,
      assignee_ids: opts.assigneeIds,
    });
  }

  for (const item of opts?.checklist ?? []) {
    const titleItem = item.trim();
    if (!titleItem) continue;
    await mcpCall(accessToken, "board_tasks_checklist_add", {
      board_id: boardId,
      task_id: taskId,
      title: titleItem.slice(0, 500),
    });
  }

  return created;
}

export async function getBoard(accessToken: string, boardId: string) {
  return mcpCall(accessToken, "boards_get", { board_id: boardId });
}

export async function listBoards(accessToken: string) {
  return mcpCall(accessToken, "boards_list", {});
}

export type BoardMember = { id: number; name?: string; email?: string };

/** Fuzzy-match assignee hint against board members (name/email). */
export function resolveAssigneeIds(
  members: BoardMember[],
  hint?: string | null,
): number[] {
  if (!hint?.trim()) return [];
  const needle = hint.trim().toLowerCase();
  const scored = members
    .map((m) => {
      const name = (m.name || "").toLowerCase();
      const email = (m.email || "").toLowerCase();
      let score = 0;
      if (name === needle || email === needle) score = 100;
      else if (name.includes(needle) || needle.includes(name)) score = 80;
      else if (email.startsWith(needle) || email.includes(needle)) score = 60;
      else {
        const parts = needle.split(/\s+/);
        if (parts.some((p) => p.length > 2 && name.includes(p))) score = 40;
      }
      return { id: m.id, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0] ? [scored[0].id] : [];
}

export function extractBoardMembers(boardResult: unknown): BoardMember[] {
  const root = boardResult as {
    members?: unknown[];
    board?: { members?: unknown[] };
  } | null;
  const list = root?.members ?? root?.board?.members ?? [];
  if (!Array.isArray(list)) return [];
  const out: BoardMember[] = [];
  for (const raw of list) {
    const m = raw as {
      id?: number;
      user_id?: number;
      name?: string;
      display_name?: string;
      email?: string;
      user?: { id?: number; name?: string; email?: string };
    };
    const id = m.id ?? m.user_id ?? m.user?.id;
    if (typeof id !== "number") continue;
    out.push({
      id,
      name: m.name || m.display_name || m.user?.name,
      email: m.email || m.user?.email,
    });
  }
  return out;
}
