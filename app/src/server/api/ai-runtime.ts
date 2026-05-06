import "server-only";

import type {
  KnowledgeRuntimeSettingsDto,
} from "@/contracts/knowledge";
import type { LlmRuntimeSettingsDto } from "@/contracts/platform-admin";

export type AiRuntimeToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AiRuntimeTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type AiRuntimeToolChoice =
  | "auto"
  | "none"
  | {
      type: "function";
      function: {
        name: string;
      };
    };

export type ChatMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: AiRuntimeToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
    };

type ChatCompletionInput = {
  runtime: LlmRuntimeSettingsDto;
  model?: string;
  apiKey?: string;
  messages: ChatMessage[];
  responseFormat?: "json_object";
  tools?: AiRuntimeTool[];
  toolChoice?: AiRuntimeToolChoice;
};

type EmbeddingInput = {
  runtime: LlmRuntimeSettingsDto;
  knowledgeRuntime: KnowledgeRuntimeSettingsDto;
  input: string | string[];
};

export class AiRuntimeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function getAiRuntimeApiKey() {
  return (
    process.env.SILICONFLOW_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

export function getAiRuntimeApiKeySource(): "siliconflow" | "llm" | "openai" | "none" {
  if (process.env.SILICONFLOW_API_KEY?.trim()) {
    return "siliconflow";
  }

  if (process.env.LLM_API_KEY?.trim()) {
    return "llm";
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return "openai";
  }

  return "none";
}

export function maskAiRuntimeApiKey() {
  const apiKey = getAiRuntimeApiKey();

  if (!apiKey) {
    return null;
  }

  if (apiKey.length <= 10) {
    return `${apiKey.slice(0, 2)}...${apiKey.slice(-2)}`;
  }

  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

export async function createChatCompletion(input: ChatCompletionInput): Promise<{
  content: string;
  model: string;
  usage?: Record<string, unknown>;
  toolCalls: AiRuntimeToolCall[];
}> {
  const apiKey = input.apiKey?.trim() || getAiRuntimeApiKey();

  if (!apiKey) {
    throw new AiRuntimeError("AI runtime API key is not configured.");
  }

  const model = input.model || input.runtime.primaryModel;
  const payload = {
    model,
    messages: selectMessagesForChatCompletion(input.messages).map(toOpenAiMessage),
    temperature: input.runtime.temperature,
    max_tokens: input.runtime.maxTokens,
    stream: false,
    ...(input.responseFormat
      ? { response_format: { type: input.responseFormat } }
      : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
    ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
  };
  const response = await postOpenAiCompatible({
    runtime: input.runtime,
    path: "/chat/completions",
    payload,
    timeoutSeconds: input.runtime.timeoutSeconds,
    apiKey,
  });
  const choice = Array.isArray(response.choices) ? response.choices[0] : null;
  const message =
    choice && typeof choice === "object" && "message" in choice
      ? toRecord(choice.message)
      : {};
  const content = firstString(message.content) ?? "";
  const toolCalls = parseToolCalls(message.tool_calls);

  if (!content && toolCalls.length === 0) {
    throw new AiRuntimeError("AI runtime returned an empty chat completion.", undefined, response);
  }

  return {
    content,
    model: firstString(response.model) ?? model,
    usage: toRecord(response.usage),
    toolCalls,
  };
}

export async function createEmbeddings(input: EmbeddingInput): Promise<{
  embeddings: number[][];
  model: string;
  usage?: Record<string, unknown>;
  dimensions: number;
}> {
  const apiKey = getAiRuntimeApiKey();

  if (!apiKey) {
    throw new AiRuntimeError("AI runtime API key is not configured.");
  }

  const requestedDimensions = getEmbeddingDimensions();
  const payload = {
    model: input.knowledgeRuntime.embeddingModel,
    input: input.input,
    encoding_format: "float",
    dimensions: requestedDimensions,
  };
  const response = await postOpenAiCompatible({
    runtime: input.runtime,
    path: "/embeddings",
    payload,
    timeoutSeconds: input.runtime.timeoutSeconds,
  });
  const data = Array.isArray(response.data) ? response.data : [];
  const embeddings = data
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).embedding : null))
    .filter((embedding): embedding is number[] => isNumberArray(embedding));

  if (embeddings.length === 0) {
    throw new AiRuntimeError("AI runtime returned no embeddings.", undefined, response);
  }

  const dimensions = embeddings[0]?.length ?? 0;

  if (dimensions !== requestedDimensions) {
    throw new AiRuntimeError(
      `Embedding dimension mismatch. Expected ${requestedDimensions}, got ${dimensions}.`,
      undefined,
      { model: input.knowledgeRuntime.embeddingModel, dimensions },
    );
  }

  return {
    embeddings,
    model: firstString(response.model) ?? input.knowledgeRuntime.embeddingModel,
    usage: toRecord(response.usage),
    dimensions,
  };
}

export function getEmbeddingDimensions() {
  const raw = process.env.EMBEDDING_DIMENSIONS?.trim();
  const parsed = raw ? Number(raw) : 1536;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1536;
}

async function postOpenAiCompatible(input: {
  runtime: LlmRuntimeSettingsDto;
  path: string;
  payload: Record<string, unknown>;
  timeoutSeconds: number;
  apiKey?: string;
}): Promise<Record<string, unknown>> {
  const apiKey = input.apiKey?.trim() || getAiRuntimeApiKey();
  const baseUrl = input.runtime.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.payload),
    signal: AbortSignal.timeout(input.timeoutSeconds * 1000),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new AiRuntimeError(
      `AI runtime request failed with status ${response.status}.`,
      response.status,
      body,
    );
  }

  return toRecord(body);
}

function selectMessagesForChatCompletion(messages: ChatMessage[], limit = 20): ChatMessage[] {
  if (messages.length <= limit) {
    return messages;
  }

  const systemMessages = messages.filter((message) => message.role === "system");
  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  const budget = Math.max(1, limit - systemMessages.length);
  const recentGroups: ChatMessage[][] = [];
  let used = 0;

  for (let index = nonSystemMessages.length - 1; index >= 0;) {
    const group: ChatMessage[] = [];
    const message = nonSystemMessages[index];

    if (message?.role === "tool") {
      while (index >= 0 && nonSystemMessages[index]?.role === "tool") {
        group.unshift(nonSystemMessages[index] as ChatMessage);
        index -= 1;
      }

      const assistant = nonSystemMessages[index];

      if (assistant?.role === "assistant" && assistant.toolCalls?.length) {
        group.unshift(assistant);
        index -= 1;
      }
    } else if (message) {
      group.unshift(message);
      index -= 1;
    } else {
      index -= 1;
    }

    if (group.length === 0) {
      continue;
    }

    if (used + group.length > budget && recentGroups.length > 0) {
      break;
    }

    recentGroups.unshift(group);
    used += group.length;

    if (used >= budget) {
      break;
    }
  }

  return [...systemMessages, ...recentGroups.flat()];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function toOpenAiMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content ?? "",
      ...(message.toolCalls && message.toolCalls.length > 0
        ? { tool_calls: message.toolCalls }
        : {}),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function parseToolCalls(value: unknown): AiRuntimeToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      const functionRecord = toRecord(record.function);
      const id = firstString(record.id);
      const name = firstString(functionRecord.name);
      const args = firstString(functionRecord.arguments);

      if (!id || !name || args === undefined) {
        return null;
      }

      return {
        id,
        type: "function" as const,
        function: {
          name,
          arguments: args,
        },
      };
    })
    .filter((item): item is AiRuntimeToolCall => item !== null);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number");
}
