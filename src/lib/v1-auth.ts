import { NextRequest, NextResponse } from "next/server";
import {
  authorizePublicApi,
  resolveOwnerIdentityId,
} from "@/lib/rooms";

/**
 * Resolve owner for public v1 APIs — Bearer token required (no session cookie).
 * Returns a NextResponse on auth/owner failure, otherwise the identity id.
 */
export async function resolveV1Owner(args: {
  req: NextRequest;
  owner_identity_id?: string;
  owner_user_id?: string;
  external_id?: string;
  title?: string;
}): Promise<{ ownerIdentityId: string } | NextResponse> {
  const auth = await authorizePublicApi(args.req);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    if (
      args.owner_identity_id ||
      args.owner_user_id ||
      args.external_id
    ) {
      const ownerIdentityId = await resolveOwnerIdentityId({
        owner_identity_id: args.owner_identity_id || args.owner_user_id,
        external_id: args.external_id,
        title: args.title,
      });
      return { ownerIdentityId };
    }

    if (auth.defaultOwnerId) {
      return { ownerIdentityId: auth.defaultOwnerId };
    }

    return NextResponse.json(
      {
        error: "owner_required",
        detail: "owner_identity_id or external_id required",
      },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "owner_resolve_failed", detail: String(err) },
      { status: 400 },
    );
  }
}
