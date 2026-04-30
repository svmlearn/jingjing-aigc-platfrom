import assert from "node:assert/strict";
import test from "node:test";

import { resolveScriptProductionRuntime } from "./script-production-runtime.ts";

const baseRuntime = {
  providerLabel: "OpenAI Compatible",
  baseUrl: "https://api.openai.com/v1",
  primaryModel: "gpt-4.1",
  fallbackModel: "gpt-4.1-mini",
  temperature: 0.7,
  maxTokens: 1800,
  timeoutSeconds: 45,
  retryCount: 2,
  apiKeyMasked: null,
  apiKeySource: "none" as const,
};

const scriptAgentSettings = {
  model: "gpt-4.1-mini",
  temperature: 0.65,
  retrievalTopK: 4,
  revisionEnabled: true,
};

test("script production can use DeepSeek video env while general consultation runtime stays disconnected", () => {
  withEnv(
    {
      SILICONFLOW_API_KEY: " ",
      LLM_API_KEY: " ",
      OPENAI_API_KEY: " ",
      VIDEO_WORKBENCH_LLM_API_KEY: "video-key",
      VIDEO_WORKBENCH_LLM_BASE_URL: "https://api.deepseek.com",
      VIDEO_WORKBENCH_LLM_MODEL: "deepseek-v4-flash",
      VIDEO_WORKBENCH_LLM_PROVIDER: "DeepSeek",
      VIDEO_WORKBENCH_LLM_TIMEOUT_SECONDS: "90",
      VIDEO_WORKBENCH_LLM_MAX_TOKENS: "6200",
    },
    () => {
      const runtime = resolveScriptProductionRuntime({
        llmRuntime: baseRuntime,
        agentSettings: scriptAgentSettings,
      });

      assert.equal(runtime.apiKey, "video-key");
      assert.equal(runtime.runtime.providerLabel, "DeepSeek");
      assert.equal(runtime.runtime.baseUrl, "https://api.deepseek.com");
      assert.equal(runtime.model, "deepseek-v4-flash");
      assert.equal(runtime.runtime.primaryModel, "deepseek-v4-flash");
      assert.equal(runtime.runtime.timeoutSeconds, 90);
      assert.equal(runtime.runtime.maxTokens, 6200);
    },
  );
});

test("script production reserves enough output tokens for full JSON scripts", () => {
  withEnv(
    {
      VIDEO_WORKBENCH_LLM_MAX_TOKENS: " ",
    },
    () => {
      const runtime = resolveScriptProductionRuntime({
        llmRuntime: baseRuntime,
        agentSettings: scriptAgentSettings,
      });

      assert.equal(runtime.runtime.maxTokens, 5000);
    },
  );
});

test("script production defaults to shared llm runtime when no video-specific override exists", () => {
  withEnv(
    {
      SILICONFLOW_API_KEY: "shared-key",
      LLM_API_KEY: " ",
      OPENAI_API_KEY: " ",
      DEEPSEEK_API_KEY: " ",
      VIDEO_WORKBENCH_LLM_API_KEY: " ",
      VIDEO_WORKBENCH_LLM_MODEL: " ",
      VIDEO_WORKBENCH_LLM_BASE_URL: " ",
      VIDEO_WORKBENCH_LLM_PROVIDER: " ",
      VIDEO_WORKBENCH_LLM_MAX_TOKENS: " ",
    },
    () => {
      const runtime = resolveScriptProductionRuntime({
        llmRuntime: baseRuntime,
        agentSettings: scriptAgentSettings,
      });

      assert.equal(runtime.apiKey, "shared-key");
      assert.equal(runtime.model, "gpt-4.1-mini");
      assert.equal(runtime.runtime.providerLabel, "OpenAI Compatible");
      assert.equal(runtime.runtime.baseUrl, "https://api.openai.com/v1");
      assert.equal(runtime.runtime.primaryModel, "gpt-4.1-mini");
    },
  );
});

test("script production falls back to not configured when no shared or video-specific key exists", () => {
  withEnv(
    {
      SILICONFLOW_API_KEY: " ",
      LLM_API_KEY: " ",
      OPENAI_API_KEY: " ",
      DEEPSEEK_API_KEY: " ",
      VIDEO_WORKBENCH_LLM_API_KEY: " ",
      VIDEO_WORKBENCH_LLM_MAX_TOKENS: " ",
    },
    () => {
      const runtime = resolveScriptProductionRuntime({
        llmRuntime: baseRuntime,
        agentSettings: scriptAgentSettings,
      });

      assert.equal(runtime.apiKey, "");
      assert.equal(runtime.model, "gpt-4.1-mini");
      assert.equal(runtime.runtime.baseUrl, "https://api.openai.com/v1");
    },
  );
});

function withEnv(overrides: Record<string, string>, run: () => void) {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = overrides[key];
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
