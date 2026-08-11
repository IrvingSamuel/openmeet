import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { actionItems, meetings } from "@/db/schema";
import {
  createBoardTask,
  extractBoardMembers,
  getBoard,
  resolveAssigneeIds,
} from "@/lib/chronos-mcp";
import { ChronosAuthError, getValidAccessToken } from "@/lib/chronos-oauth";
import { getSession } from "@/lib/session";

const taskSchema = z.object({
  actionItemId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  boardId: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assigneeIds: z.array(z.number().int()).optional(),
  assigneeHint: z.string().optional().nullable(),
  checklist: z.array(z.string()).optional(),
});

const schema = z.object({
  meetingId: z.string().uuid(),
  tasks: z.array(taskSchema).min(1).max(20),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const body = schema.parse(await req.json());
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, body.meetingId),
  });
  if (!meeting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.identityId);
  } catch (e) {
    if (e instanceof ChronosAuthError) {
      return NextResponse.json({ error: e.code }, { status: 401 });
    }
    throw e;
  }

  const results = [];
  for (const task of body.tasks) {
    let assigneeIds = task.assigneeIds ?? [];
    if (!assigneeIds.length && task.assigneeHint) {
      const boardRes = await getBoard(accessToken, task.boardId);
      if (boardRes.ok) {
        assigneeIds = resolveAssigneeIds(
          extractBoardMembers(boardRes.result),
          task.assigneeHint,
        );
      }
    }

    const created = await createBoardTask(
      accessToken,
      task.boardId,
      task.title,
      {
        description:
          task.description ||
          `Gerado pelo Chronos Meet a partir da reunião ${meeting.slug}`,
        dueDate: task.dueDate,
        priority: task.priority,
        assigneeIds,
        checklist: task.checklist,
      },
    );

    if (created.error === "reauth_required") {
      return NextResponse.json({ error: "reauth_required" }, { status: 401 });
    }

    const result = created.result as { id?: string; task_id?: string } | null;
    const chronosTaskId = result?.id || result?.task_id || null;
    const status = created.ok ? "created" : "failed";

    if (task.actionItemId) {
      await db
        .update(actionItems)
        .set({
          status,
          chronosTaskId,
          chronosBoardId: task.boardId,
          title: task.title,
          assigneeHint: task.assigneeHint,
          raw: task,
        })
        .where(eq(actionItems.id, task.actionItemId));
    } else {
      await db.insert(actionItems).values({
        meetingId: meeting.id,
        title: task.title,
        assigneeHint: task.assigneeHint,
        chronosTaskId,
        chronosBoardId: task.boardId,
        status,
        raw: task,
      });
    }

    results.push({
      title: task.title,
      ok: created.ok,
      chronosTaskId,
      error: created.error,
    });
  }

  return NextResponse.json({ results });
}
