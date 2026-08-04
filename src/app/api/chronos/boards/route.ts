import { NextRequest, NextResponse } from "next/server";
import {
  extractBoardMembers,
  getBoard,
  listBoards,
} from "@/lib/chronos-mcp";
import { ChronosAuthError, getValidAccessToken } from "@/lib/chronos-oauth";
import { getSession } from "@/lib/session";

/** List Chronos boards (+ optional members for a board) for the summary UI. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.identityId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
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

  const boardId = req.nextUrl.searchParams.get("boardId");
  if (boardId) {
    const board = await getBoard(accessToken, boardId);
    if (!board.ok) {
      if (board.error === "reauth_required") {
        return NextResponse.json({ error: "reauth_required" }, { status: 401 });
      }
      return NextResponse.json({ error: board.error }, { status: 502 });
    }
    return NextResponse.json({
      board: board.result,
      members: extractBoardMembers(board.result),
    });
  }

  const boards = await listBoards(accessToken);
  if (!boards.ok) {
    if (boards.error === "reauth_required") {
      return NextResponse.json({ error: "reauth_required" }, { status: 401 });
    }
    return NextResponse.json({ error: boards.error }, { status: 502 });
  }

  const raw = boards.result as
    | { boards?: unknown[] }
    | unknown[]
    | null;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.boards)
      ? raw.boards
      : [];

  return NextResponse.json({ boards: list });
}
