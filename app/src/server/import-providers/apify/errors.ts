import "server-only";

import type { ImportErrorCode } from "@/contracts/import";

export class ImportProviderError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function mapApifyHttpError(status: number, body: string) {
  if (status === 401 || status === 403) {
    return new ImportProviderError("PROVIDER_AUTH_FAILED", "Apify authentication failed.", false);
  }

  if (status === 429) {
    return new ImportProviderError("PROVIDER_RATE_LIMITED", "Apify rate limit exceeded.", true);
  }

  const normalizedBody = body.toLowerCase();

  if (normalizedBody.includes("memory") || normalizedBody.includes("actor-memory")) {
    return new ImportProviderError(
      "PROVIDER_MEMORY_LIMIT",
      "Apify actor memory or concurrency limit was reached.",
      true,
      body,
    );
  }

  return new ImportProviderError(
    "PROVIDER_RUN_FAILED",
    `Apify request failed with HTTP ${status}.`,
    status >= 500,
    body,
  );
}
