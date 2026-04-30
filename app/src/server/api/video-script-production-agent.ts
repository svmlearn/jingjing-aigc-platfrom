import { buildActiveScriptProductionPromptCards } from "./video-script-production-agent-prompt-doc.ts";
import type {
  ScriptProductionAgentMessage,
  ScriptProductionBrief,
  VideoScriptRevisionContext,
} from "./video-script-production-agent-runtime.ts";

export type {
  ScriptProductionAgentMessage,
  ScriptProductionAgentParseResult,
  ScriptProductionBrief,
  ScriptProductionBriefValidation,
  ScriptProductionVersion,
  VideoScriptRevisionContext,
  VideoScriptRevisionIntent,
} from "./video-script-production-agent-runtime.ts";

export {
  classifyVideoScriptRevisionIntent,
  parseScriptProductionAgentResponse,
  validateScriptProductionBrief,
} from "./video-script-production-agent-runtime.ts";

export const SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION = "script-production-agent-v3";

export const SCRIPT_PRODUCTION_AGENT_MAX_STEPS = 10;

export const SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED_MESSAGE =
  "未接入大模型，请检查是否接入大模型后再生成脚本。";

export const SCRIPT_PRODUCTION_MODEL_UNAVAILABLE_MESSAGE =
  "脚本制作 Agent 调用大模型失败，请检查是否接入大模型、模型服务和 API 配置后再生成脚本。";

export const SCRIPT_PRODUCTION_MODEL_OUTPUT_INVALID_MESSAGE =
  "脚本制作 Agent 返回内容无法解析，请检查大模型输出格式后再生成脚本。";

export const SCRIPT_PRODUCTION_TOOL_FAILED_MESSAGE =
  "脚本制作 tool 调用失败，请检查工具链路后再生成脚本。";

export const SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT = [
  "【短视频脚本设计大师 Prompt 目录】",
  "01. 本系统提示词只保留规则目录；执行细则全部读取本轮 activePromptCards。",
  "02. R0 角色边界：activePromptCards.role_boundary。",
  "03. R1 信息门槛：activePromptCards.sufficiency_threshold。",
  "04. R2 事实优先级：activePromptCards.source_priority。",
  "05. R3 生成与修订：activePromptCards.initial_generation 或 activePromptCards.versioning。",
  "06. R4 输出格式与状态：activePromptCards.output_contract（格式骨架见该卡 schema）。",
  "07. R5 工具、失败与合规：activePromptCards.tool_and_failure。",
].join("\n");

export function isScriptProductionModelConfigured(apiKey: string | null | undefined) {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

export function buildScriptProductionAgentMessages(input: {
  brief: ScriptProductionBrief;
  revisionContext?: VideoScriptRevisionContext | null;
}): ScriptProductionAgentMessage[] {
  return [
    {
      role: "system",
      content: SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: input.revisionContext
            ? "revise_video_script_version"
            : "generate_video_script_version",
          promptVersion: SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION,
          maxSteps: SCRIPT_PRODUCTION_AGENT_MAX_STEPS,
          activePromptCards: buildActiveScriptProductionPromptCards({
            revisionContext: input.revisionContext ?? null,
          }),
          scriptProductionBrief: input.brief,
          revisionContext: input.revisionContext ?? null,
        },
        null,
        2,
      ),
    },
  ];
}
