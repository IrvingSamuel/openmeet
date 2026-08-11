/** Generic board-like helpers (legacy Chronos board shape, optional). */

export type BoardLike = {
  board_id?: string;
  id?: string;
  is_shared?: boolean;
  member_count?: number;
};

/** Personal board: not shared (fallback: single member). */
export function isPersonalBoard(b: BoardLike | undefined | null): boolean {
  if (!b) return false;
  if (b.is_shared === false) return true;
  if (b.is_shared === true) return false;
  return typeof b.member_count === "number" && b.member_count <= 1;
}
