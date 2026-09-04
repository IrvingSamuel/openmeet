import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getDeploymentMode, isSignupAllowed, needsSetup } from "@/lib/deployment-mode";
import { isOidcEnabled } from "@/lib/oidc";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const setup = await needsSetup();
  if (!session.isLoggedIn) {
    return NextResponse.json({
      isLoggedIn: false,
      needsSetup: setup,
      oidcEnabled: isOidcEnabled(),
      signupAllowed: setup ? false : await isSignupAllowed(),
      deploymentMode: await getDeploymentMode(),
    });
  }
  return NextResponse.json({
    isLoggedIn: true,
    identityId: session.identityId,
    userId: session.userId || session.identityId,
    name: session.name,
    email: session.email,
    avatarUrl: session.avatarUrl,
    role: session.role,
    isAdmin: isAdmin(session),
    needsSetup: false,
    oidcEnabled: isOidcEnabled(),
    signupAllowed: await isSignupAllowed(),
    deploymentMode: await getDeploymentMode(),
  });
}
