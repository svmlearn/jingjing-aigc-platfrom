import "server-only";

import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listOperationalMerchantWorkspacesByUserId } from "@/lib/db/merchant-repository";

function getMemberLoginUrl(nextPath: string, error = "unauthenticated") {
  const params = new URLSearchParams({ error });
  if (nextPath.startsWith("/member") && !nextPath.startsWith("/member/login")) {
    params.set("next", nextPath);
  }

  return `/member/login?${params.toString()}`;
}

export async function requireMemberAccess(nextPath: string) {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    redirect(getMemberLoginUrl(nextPath));
  }

  const workspaces = await listOperationalMerchantWorkspacesByUserId(user.id).catch(() => []);
  if (workspaces.length === 0) {
    redirect(getMemberLoginUrl(nextPath, "no-member-workspace"));
  }

  return { user, workspaces };
}

export async function getOptionalMemberAccess() {
  try {
    const user = await getAuthenticatedUser();
    const workspaces = await listOperationalMerchantWorkspacesByUserId(user.id).catch(() => []);
    return { user, workspaces };
  } catch {
    return null;
  }
}
