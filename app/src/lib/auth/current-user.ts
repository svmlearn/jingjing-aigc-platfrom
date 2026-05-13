import "server-only";

import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";

import {
  getDomesticAuthenticatedUser,
  isDomesticSessionEnabled,
} from "@/lib/auth/domestic-session";
import { createLocalDemoUser } from "@/lib/demo/local-demo-runtime";
import { createSupabaseServerClient, isSupabasePublicConfigured } from "@/lib/supabase/server";
import { ApiError } from "@/server/api/errors";

export async function getAuthenticatedUser(): Promise<User> {
  if (isDomesticSessionEnabled()) {
    return getDomesticAuthenticatedUser();
  }

  if (!isSupabasePublicConfigured()) {
    return createLocalDemoUser(await readLocalDemoUserId());
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }

  return data.user;
}

async function readLocalDemoUserId() {
  try {
    const requestHeaders = await headers();
    const userId = requestHeaders.get("x-jingjing-demo-user-id")?.trim();

    return userId?.startsWith("demo-") ? userId : undefined;
  } catch {
    return undefined;
  }
}
