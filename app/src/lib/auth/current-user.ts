import "server-only";

import type { User } from "@supabase/supabase-js";

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
    throw new ApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Cloud Supabase environment variables are required.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }

  return data.user;
}
