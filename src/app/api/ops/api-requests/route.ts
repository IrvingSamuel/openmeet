import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import {
  listOpsApiRequests,
  listOpsApiTokenFilters,
} from "@/ops/api-requests";

export async function GET(req: NextRequest) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const tokenId = sp.get("tokenId");
  const q = sp.get("q");
  const cursor = sp.get("cursor");
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;

  const [result, filters] = await Promise.all([
    listOpsApiRequests({
      tokenId: tokenId || null,
      q,
      cursor,
      limit: Number.isFinite(limit) ? limit : 50,
    }),
    listOpsApiTokenFilters(),
  ]);

  return NextResponse.json({
    ...result,
    filters,
  });
}
