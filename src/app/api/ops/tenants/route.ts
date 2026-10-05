import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/ops/auth";
import { listTenants } from "@/ops/tenants";

export async function GET(req: NextRequest) {
  const auth = await requireOpsAdmin();
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 100;

  const tenants = await listTenants({
    q,
    limit: Number.isFinite(limit) ? limit : 100,
  });

  return NextResponse.json({ tenants });
}
