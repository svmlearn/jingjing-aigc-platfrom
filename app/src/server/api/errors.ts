import "server-only";

import { z } from "zod";

import {
  getCurrentPlatformAdmin,
  isPlatformAdminRoleAllowed,
} from "@/lib/auth/platform-admin-session";
import type { PlatformAdminRole, PlatformAdminUserDto } from "@/contracts/platform-admin";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function assertPlatformAdminAccess(
  _request: Request,
  options: { roles?: PlatformAdminRole[] } = {},
): Promise<PlatformAdminUserDto> {
  const adminUser = await getCurrentPlatformAdmin();

  if (!adminUser) {
    throw new ApiError(401, "UNAUTHORIZED", "Platform admin login is required.");
  }

  if (!isPlatformAdminRoleAllowed(adminUser, options.roles)) {
    throw new ApiError(403, "FORBIDDEN", "Current platform admin role cannot perform this operation.");
  }

  return adminUser;
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request payload is invalid.",
          details: z.treeifyError(error),
        },
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error.";

  return Response.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message,
      },
    },
    { status: 500 },
  );
}
