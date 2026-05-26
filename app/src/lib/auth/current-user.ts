import "server-only";

import {
  getDomesticAuthenticatedUser,
  isDomesticSessionEnabled,
} from "@/lib/auth/domestic-session";
import type { AuthenticatedUser } from "@/lib/auth/authenticated-user";
import { isAppPostgresConfigured } from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  if (isDomesticSessionEnabled()) {
    return getDomesticAuthenticatedUser();
  }

  if (!isAppPostgresConfigured()) {
    throw new ApiError(
      503,
      "APP_DATABASE_NOT_CONFIGURED",
      "APP_DATABASE_URL or DATABASE_URL is required for application session mode.",
    );
  }

  throw new ApiError(
    503,
    "APP_SESSION_NOT_CONFIGURED",
    "Application session provider is not configured.",
  );
}
