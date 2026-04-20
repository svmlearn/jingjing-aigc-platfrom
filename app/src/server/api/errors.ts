import "server-only";

import { z } from "zod";

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

export function assertAdminSetupSecret(request: Request) {
  const expected = process.env.ADMIN_SETUP_SECRET;

  if (!expected) {
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

  if (provided !== expected) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid admin setup secret.");
  }
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
