import { NextResponse } from "next/server";

/**
 * @deprecated Use /api/admin/settings/api-tokens
 * Kept to return a clear error if old clients hit the singular endpoint.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "deprecated",
      detail: "Use POST /api/admin/settings/api-tokens with { name }",
    },
    { status: 410 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "deprecated",
      detail: "Use DELETE /api/admin/settings/api-tokens/{id}",
    },
    { status: 410 },
  );
}
