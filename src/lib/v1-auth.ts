import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { authorizeBearer, resolveOwnerIdentityId } from "@/lib/rooms";

export type V1AuthSession = Awaited<ReturnType<typeof getSession>>;

/**
 * Resolve owner for public v1 APIs (Bearer token or session cookie).
 * Returns a NextResponse on auth/owner failure, otherwise the identity id.
 */
export async function resolveV1Owner(args: {
  req: NextRequest;
  owner_identity_id?: string;
  owner_user_id?: string;
  external_id?: string;
  chronos_user_id?: string;
  title?: string;
}): Promise<{ ownerIdentityId: string } | NextResponse> {
  const session = await getSession();
  const bearerOk = authorizeBearer(args.req);

  if (!bearerOk && !(session.isLoggedIn && session.identityId)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    if (
      session.isLoggedIn &&
      session.identityId &&
      (!bearerOk ||
        (!args.owner_identity_id &&
          !args.owner_user_id &&
          !args.external_id &&
          !args.chronos_user_id))
    ) {
      return { ownerIdentityId: session.identityId };
    }
    if (bearerOk) {
      const ownerIdentityId = await resolveOwnerIdentityId({
        owner_identity_id: args.owner_identity_id || args.owner_user_id,
        external_id: args.external_id || args.chronos_user_id,
        title: args.title,
      });
      return { ownerIdentityId };
    }
    return { ownerIdentityId: session.identityId! };
  } catch (err) {
    return NextResponse.json(
      { error: "owner_resolve_failed", detail: String(err) },
      { status: 400 },
    );
  }
}
