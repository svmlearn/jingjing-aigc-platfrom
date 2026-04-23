import "server-only";

import type { ImportRequest } from "@/contracts/import";
import { getApifyActorConfig } from "@/server/import-providers/apify/actors";
import { ImportProviderError, mapApifyHttpError } from "@/server/import-providers/apify/errors";
import {
  normalizeApifyComments,
  normalizeApifySourceItems,
} from "@/server/import-providers/apify/normalizers";
import type {
  ImportProviderAdapter,
  NormalizedComment,
  NormalizedSourceItem,
  ProviderRun,
} from "@/server/import-providers/types";

type ApifyRunData = {
  id?: string;
  status?: ProviderRun["status"];
  defaultDatasetId?: string;
  usageTotalUsd?: number;
  stats?: {
    usageTotalUsd?: number;
  };
};

export class ApifyProviderAdapter implements ImportProviderAdapter {
  private readonly baseUrl = "https://api.apify.com/v2";

  constructor(
    private readonly token = process.env.APIFY_TOKEN,
    private readonly waitSeconds = readWaitSeconds(),
  ) {}

  async startImport(request: ImportRequest): Promise<ProviderRun> {
    const token = this.requireToken();
    const actorConfig = getApifyActorConfig(request);
    const response = await fetch(
      `${this.baseUrl}/acts/${actorConfig.actorId}/runs?waitForFinish=${this.waitSeconds}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(actorConfig.buildInput(request)),
      },
    );

    const body = await response.text();

    if (!response.ok) {
      throw mapApifyHttpError(response.status, body);
    }

    return mapRunResponse(actorConfig.actorId, parseApifyJson(body));
  }

  async getRun(runId: string): Promise<ProviderRun> {
    const token = this.requireToken();
    const response = await fetch(`${this.baseUrl}/actor-runs/${runId}`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.text();

    if (!response.ok) {
      throw mapApifyHttpError(response.status, body);
    }

    return mapRunResponse("unknown", parseApifyJson(body));
  }

  async getDatasetItems(datasetId: string): Promise<unknown[]> {
    const token = this.requireToken();
    const response = await fetch(
      `${this.baseUrl}/datasets/${datasetId}/items?clean=true&format=json`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    const body = await response.text();

    if (!response.ok) {
      throw mapApifyHttpError(response.status, body);
    }

    const parsed = JSON.parse(body) as unknown;

    if (!Array.isArray(parsed)) {
      throw new ImportProviderError(
        "NORMALIZATION_FAILED",
        "Apify dataset response is not an array.",
        false,
        parsed,
      );
    }

    return parsed;
  }

  normalizeSourceItems(request: ImportRequest, items: unknown[]): NormalizedSourceItem[] {
    return normalizeApifySourceItems(request, items);
  }

  normalizeComments(request: ImportRequest, items: unknown[]): NormalizedComment[] {
    return normalizeApifyComments(request, items);
  }

  private requireToken() {
    if (!this.token) {
      throw new ImportProviderError(
        "PROVIDER_AUTH_FAILED",
        "APIFY_TOKEN is not configured.",
        false,
      );
    }

    return this.token;
  }
}

function mapRunResponse(actorId: string, payload: unknown): ProviderRun {
  const data = extractRunData(payload);
  const runId = data.id;
  const datasetId = data.defaultDatasetId;
  const status = data.status;

  if (!runId || !datasetId || !status) {
    throw new ImportProviderError(
      "PROVIDER_RUN_FAILED",
      "Apify run response is missing id, status, or dataset id.",
      false,
      payload,
    );
  }

  return {
    provider: "apify",
    actorId,
    runId,
    datasetId,
    status,
    usageTotalUsd: data.usageTotalUsd ?? data.stats?.usageTotalUsd,
    raw: payload,
  };
}

function extractRunData(payload: unknown): ApifyRunData {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as ApifyRunData;
  }

  return record as ApifyRunData;
}

function parseApifyJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ImportProviderError(
      "PROVIDER_RUN_FAILED",
      "Apify returned a non-JSON response.",
      true,
      body,
    );
  }
}

function readWaitSeconds() {
  const value = Number(process.env.APIFY_WAIT_SECONDS ?? 120);

  if (!Number.isFinite(value)) {
    return 120;
  }

  return Math.min(Math.max(value, 0), 180);
}
