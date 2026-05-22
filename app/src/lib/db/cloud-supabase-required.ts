import "server-only";

import { isAppPostgresConfigured, isAppPostgresPreferred } from "@/lib/server-db/postgres";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

export function currentDatabaseRequiredError() {
  if (!isAppPostgresConfigured()) {
    return new ApiError(
      503,
      "APP_DATABASE_NOT_CONFIGURED",
      "APP_DATABASE_URL or DATABASE_URL is required for PostgreSQL mode.",
    );
  }

  return new ApiError(
    503,
    "APP_DATABASE_REPOSITORY_UNAVAILABLE",
    "PostgreSQL repository path is not available for this operation.",
  );
}

export function legacySupabaseRequiredError(code = "LEGACY_AUTH_FALLBACK_NOT_CONFIGURED") {
  return new ApiError(
    503,
    code,
    "Legacy Supabase fallback is not configured for this environment.",
  );
}

export function cloudSupabaseRequiredError(code = "LEGACY_AUTH_FALLBACK_NOT_CONFIGURED") {
  if (isAppPostgresPreferred()) {
    return currentDatabaseRequiredError();
  }

  return legacySupabaseRequiredError(code);
}

export function requireCloudSupabaseAdmin(code?: string) {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError(code);
  }
}
