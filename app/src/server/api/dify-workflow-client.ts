import "server-only";

import { ApiError } from "@/server/api/errors";

type DifyWorkflowResponseMode = "blocking" | "streaming";

type DifyWorkflowRunResult = {
  finalResultJson: unknown;
  workflowRunId?: string | null;
  rawOutputs?: Record<string, unknown> | null;
};

export async function runDifyWorkflow(input: {
  inputs: Record<string, unknown>;
  user: string;
}): Promise<DifyWorkflowRunResult> {
  const mockResult = process.env.DIFY_MOCK_FINAL_RESULT_JSON;

  if (mockResult) {
    return {
      finalResultJson: JSON.parse(mockResult) as unknown,
      workflowRunId: "mock-dify-workflow-run",
      rawOutputs: { final_result_json: JSON.parse(mockResult) as unknown },
    };
  }

  const config = getDifyWorkflowConfig();
  const response = await fetch(`${config.baseUrl}/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: input.inputs,
      response_mode: config.responseMode,
      user: input.user,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "DIFY_WORKFLOW_REQUEST_FAILED",
      `Dify workflow request failed with HTTP ${response.status}.`,
    );
  }

  return config.responseMode === "streaming"
    ? parseDifyStreamingResponse(response)
    : parseDifyBlockingResponse(response);
}

function getDifyWorkflowConfig() {
  const apiKey = process.env.DIFY_API_KEY?.trim();

  if (!apiKey) {
    throw new ApiError(503, "DIFY_API_KEY_MISSING", "Dify API key is not configured.");
  }

  const responseMode = normalizeResponseMode(process.env.DIFY_WORKFLOW_RESPONSE_MODE);
  const timeoutSeconds = parsePositiveInt(process.env.DIFY_WORKFLOW_TIMEOUT_SECONDS, 900);

  return {
    apiKey,
    baseUrl: (process.env.DIFY_BASE_URL?.trim() || "https://api.dify.ai/v1").replace(/\/+$/, ""),
    responseMode,
    timeoutMs: timeoutSeconds * 1000,
  };
}

async function parseDifyBlockingResponse(response: Response): Promise<DifyWorkflowRunResult> {
  const payload = (await response.json()) as Record<string, unknown>;
  const data = toRecord(payload.data);
  const outputs = toRecord(data.outputs);
  const finalResultJson = pickFinalResultJson(outputs, payload);

  if (finalResultJson === undefined) {
    throw new ApiError(
      502,
      "DIFY_FINAL_RESULT_JSON_MISSING",
      "Dify workflow did not return outputs.final_result_json.",
    );
  }

  return {
    finalResultJson,
    workflowRunId: readString(payload.workflow_run_id) || readString(data.id),
    rawOutputs: outputs,
  };
}

async function parseDifyStreamingResponse(response: Response): Promise<DifyWorkflowRunResult> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new ApiError(502, "DIFY_STREAM_MISSING", "Dify streaming response body is missing.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let workflowRunId: string | null = null;
  let rawOutputs: Record<string, unknown> | null = null;
  let finalResultJson: unknown;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice("data:".length).trim();

      if (!data || data === "[DONE]") {
        continue;
      }

      const event = parseJsonRecord(data);
      workflowRunId = readString(event.workflow_run_id) || workflowRunId;
      const eventData = toRecord(event.data);
      const outputs = toRecord(eventData.outputs);
      const currentFinalJson = pickFinalResultJson(outputs, event);

      if (Object.keys(outputs).length) {
        rawOutputs = outputs;
      }

      if (currentFinalJson !== undefined) {
        finalResultJson = currentFinalJson;
      }
    }

    if (done) {
      break;
    }
  }

  if (finalResultJson === undefined) {
    throw new ApiError(
      502,
      "DIFY_FINAL_RESULT_JSON_MISSING",
      "Dify workflow stream did not return outputs.final_result_json.",
    );
  }

  return {
    finalResultJson,
    workflowRunId,
    rawOutputs,
  };
}

function pickFinalResultJson(
  outputs: Record<string, unknown>,
  fallback: Record<string, unknown>,
): unknown {
  return outputs.final_result_json ?? fallback.final_result_json ?? outputs.finalResultJson;
}

function normalizeResponseMode(value: string | undefined): DifyWorkflowResponseMode {
  return value === "streaming" ? "streaming" : "blocking";
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    return toRecord(JSON.parse(value) as unknown);
  } catch {
    return {};
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
