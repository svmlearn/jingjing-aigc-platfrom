import type { ScriptProductionAgentSettingsDto } from "@/contracts/knowledge";
import type { LlmRuntimeSettingsDto } from "@/contracts/platform-admin";

type ResolveScriptProductionRuntimeInput = {
  llmRuntime: LlmRuntimeSettingsDto;
  agentSettings: ScriptProductionAgentSettingsDto;
};

const SCRIPT_PRODUCTION_MIN_MAX_TOKENS = 5000;

export function resolveScriptProductionRuntime(input: ResolveScriptProductionRuntimeInput): {
  apiKey: string;
  model: string;
  runtime: LlmRuntimeSettingsDto;
} {
  const model =
    firstEnv("VIDEO_WORKBENCH_LLM_MODEL") ??
    input.llmRuntime.fallbackModel?.trim() ??
    input.llmRuntime.primaryModel;
  const timeoutSeconds =
    readPositiveIntEnv("VIDEO_WORKBENCH_LLM_TIMEOUT_SECONDS") ?? input.llmRuntime.timeoutSeconds;
  const maxTokens =
    readPositiveIntEnv("VIDEO_WORKBENCH_LLM_MAX_TOKENS") ??
    Math.max(input.llmRuntime.maxTokens, SCRIPT_PRODUCTION_MIN_MAX_TOKENS);

  return {
    apiKey: getScriptProductionApiKey(),
    model,
    runtime: {
      ...input.llmRuntime,
      providerLabel: firstEnv("VIDEO_WORKBENCH_LLM_PROVIDER") ?? input.llmRuntime.providerLabel,
      baseUrl: firstEnv("VIDEO_WORKBENCH_LLM_BASE_URL") ?? input.llmRuntime.baseUrl,
      primaryModel: model,
      fallbackModel: model,
      maxTokens,
      timeoutSeconds,
    },
  };
}

function getScriptProductionApiKey() {
  return (
    firstEnv(
      "VIDEO_WORKBENCH_LLM_API_KEY",
      "DEEPSEEK_API_KEY",
      "SILICONFLOW_API_KEY",
      "LLM_API_KEY",
      "OPENAI_API_KEY",
    ) ?? ""
  );
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readPositiveIntEnv(name: string) {
  const rawValue = firstEnv(name);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
