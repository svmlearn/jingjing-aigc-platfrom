import "server-only";

import { ApiError } from "@/server/api/errors";

type TikHubRequestInput = {
  endpoint: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
};

const defaultBaseUrl = "https://api.tikhub.io";

export function isTikHubConfigured() {
  return Boolean(getTikHubApiKey());
}

export function getTikHubBaseUrl() {
  return (process.env.TIKHUB_BASE_URL || defaultBaseUrl).replace(/\/+$/, "");
}

export async function requestTikHub(input: TikHubRequestInput): Promise<unknown> {
  const apiKey = getTikHubApiKey();

  if (!apiKey) {
    throw new ApiError(
      503,
      "TIKHUB_API_KEY_MISSING",
      "TikHub API key is not configured. Set TIKHUB_API_KEY on the server.",
    );
  }

  const method = input.method ?? "GET";
  const url = new URL(`${getTikHubBaseUrl()}${input.endpoint}`);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    body: method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
    signal: AbortSignal.timeout(getTikHubTimeoutMs()),
  });
  const text = await response.text();
  const payload = parseJsonPayload(text);

  if (!response.ok || isTikHubApplicationError(payload)) {
    throw new ApiError(
      response.status >= 400 ? response.status : 502,
      "TIKHUB_REQUEST_FAILED",
      extractTikHubErrorMessage(payload, response.status),
      {
        provider: "tikhub",
        endpoint: input.endpoint,
        status: response.status,
      },
    );
  }

  return payload;
}

function getTikHubApiKey() {
  return process.env.TIKHUB_API_KEY || process.env.TIKHUB_TOKEN || "";
}

function getTikHubTimeoutMs() {
  const seconds = Number(process.env.TIKHUB_TIMEOUT_SECONDS ?? 45);
  const boundedSeconds = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 10), 90) : 45;

  return boundedSeconds * 1000;
}

function parseJsonPayload(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return {
      message: "TikHub returned a non-JSON response.",
      rawText: text.slice(0, 500),
    };
  }
}

function isTikHubApplicationError(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const code = record.code ?? (record.detail as Record<string, unknown> | undefined)?.code;

  return typeof code === "number" && code >= 400;
}

function extractTikHubErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const detail = record.detail;

    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const detailRecord = detail as Record<string, unknown>;
      if (typeof detailRecord.message_zh === "string") return detailRecord.message_zh;
      if (typeof detailRecord.message === "string") return detailRecord.message;
    }

    if (typeof record.message_zh === "string") return record.message_zh;
    if (typeof record.message === "string") return record.message;
  }

  return `TikHub request failed with HTTP ${status}.`;
}
