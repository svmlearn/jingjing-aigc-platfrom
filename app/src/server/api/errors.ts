import "server-only";

import { z } from "zod";

import {
  isValidPlatformAdminSessionValue,
  platformAdminSessionCookieName,
} from "@/lib/auth/platform-admin-session";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";

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

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookie) {
    return undefined;
  }

  return decodeURIComponent(cookie.slice(name.length + 1));
}

export function assertAdminSetupSecret(request: Request) {
  const expected = process.env.ADMIN_SETUP_SECRET;

  if (!expected) {
    if (isLocalDemoRuntime() && isLocalhostRequest(request)) {
      return;
    }

    throw new ApiError(
      503,
      "ADMIN_SETUP_SECRET_NOT_CONFIGURED",
      "Invitation code creation is not configured.",
    );
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  const provided = request.headers.get("x-admin-secret") ?? bearerToken;
  const session = getCookieValue(request, platformAdminSessionCookieName);

  if (isValidPlatformAdminSessionValue(session)) {
    return;
  }

  if (provided !== expected) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid admin setup secret.");
  }
}

export function assertPlatformAdminAccess(request: Request) {
  assertAdminSetupSecret(request);
}

function isLocalhostRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
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
