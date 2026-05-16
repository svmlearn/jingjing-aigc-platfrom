import "server-only";

import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

export function cloudSupabaseRequiredError(code = "SUPABASE_NOT_CONFIGURED") {
  return new ApiError(503, code, "Cloud Supabase environment variables are required.");
}

export function requireCloudSupabaseAdmin(code?: string) {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError(code);
  }
}
