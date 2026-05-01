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
  void input.agentSettings;

  const model = input.llmRuntime.fallbackModel?.trim() ?? input.llmRuntime.primaryModel;
  const maxTokens = Math.max(input.llmRuntime.maxTokens, SCRIPT_PRODUCTION_MIN_MAX_TOKENS);

  return {
    apiKey: getScriptProductionApiKey(),
    model,
    runtime: {
      ...input.llmRuntime,
      primaryModel: model,
      fallbackModel: model,
      maxTokens,
    },
  };
}

function getScriptProductionApiKey() {
  return firstEnv("SILICONFLOW_API_KEY", "LLM_API_KEY", "OPENAI_API_KEY") ?? "";
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
