import "server-only";

import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/server/api/errors";

export async function getAuthenticatedUser(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }

  return data.user;
}
