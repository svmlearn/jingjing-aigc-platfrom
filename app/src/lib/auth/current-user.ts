import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  getDomesticAuthenticatedUser,
  isDomesticSessionEnabled,
} from "@/lib/auth/domestic-session";
import { isAppPostgresConfigured, isAppPostgresPreferred } from "@/lib/server-db/postgres";
import { createSupabaseServerClient, isSupabasePublicConfigured } from "@/lib/supabase/server";
import { ApiError } from "@/server/api/errors";

export async function getAuthenticatedUser(): Promise<User> {
  if (isDomesticSessionEnabled()) {
    return getDomesticAuthenticatedUser();
  }

  if (isAppPostgresPreferred()) {
    if (!isAppPostgresConfigured()) {
      throw new ApiError(
        503,
        "APP_DATABASE_NOT_CONFIGURED",
        "APP_DATABASE_URL or DATABASE_URL is required for PostgreSQL session mode.",
      );
    }

    throw new ApiError(
      503,
      "APP_SESSION_NOT_CONFIGURED",
      "Application session provider is not configured for PostgreSQL mode.",
    );
  }

  if (!isSupabasePublicConfigured()) {
    throw new ApiError(
      503,
      "APP_SESSION_NOT_CONFIGURED",
      "Application session provider is not configured.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }

  return data.user;
}
