import { NextResponse } from "next/server";
import {
  resolveOwnerIdentityId,
  type PublicApiAuthResult,
} from "@/lib/rooms";

/**
 * Resolve owner for public v1 APIs given an already-authorized Bearer result.
 * Returns a NextResponse on owner failure, otherwise the identity id.
 */
export async function resolveV1OwnerFromAuth(args: {
  auth: PublicApiAuthResult & { ok: true };
  owner_identity_id?: string;
  owner_user_id?: string;
  external_id?: string;
  title?: string;
}): Promise<{ ownerIdentityId: string } | NextResponse> {
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

    if (args.auth.defaultOwnerId) {
      return { ownerIdentityId: args.auth.defaultOwnerId };
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
