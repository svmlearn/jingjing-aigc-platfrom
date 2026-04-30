# 2026-04-30 脚本制作 Agent prompt 清理与重设计 Handoff

## 当前目标

将脚本制作 Agent 的 custom prompt 收敛为单一来源，并按“视频工作台脚本生成 / 多轮修改 / 版本沉淀”的新边界重设计：

- 只保留 `app/src/server/api/video-script-production-agent.ts` 中的 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT`。
- Agent 只负责短视频脚本初版生成与语义修订。
- 唯一受控工具是 `modify_script / 脚本制作 tool`。
- 未接入大模型时不再返回默认脚本，而是明确提示检查大模型接入。
- 模型输入输出从三候选 `candidates` 收敛为单个脚本 `version`。

## 已完成内容

- 后台平台设置不再展示脚本制作 Agent 的 System Prompt 输入框。
- `platformSettingsUpdateSchema` 不再接收 `scriptProductionAgent.systemPrompt`。
- `ScriptProductionAgentSettingsDto` 不再包含 `systemPrompt`。
- `buildScriptProductionAgentMessages` 不再接收外部 `systemPrompt` 参数，始终使用 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT`。
- 内容生成服务不再把平台设置里的 prompt 传入脚本 Agent。
- `script_production_agent` migration seed 不再写入 `systemPrompt`。
- 新增 schema 回归测试，保证 settings update 会剔除脚本 Agent prompt。
- `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT` 已按用途分块：
  - 目标
  - 输入
  - 输出
  - Tools
  - Memory
  - Loop
  - Failure
- Prompt 中已移除“视频制作 tool”和“抖音竖版”这类过窄或越界表达。
- Prompt 和模型输入输出已从 `candidates` 三候选改为单个 `version` 脚本版本。
- Prompt 中已约束：只要求支持多轮对话上下文，不需要长期记忆。
- 新增 `SCRIPT_PRODUCTION_AGENT_MAX_STEPS = 10`，并写入 prompt 和模型输入 payload。
- Prompt 中已约束：用户刚开始使用脚本制作时，先确认是否有明确脚本制作要求；如果没有额外要求且信息足够，直接生成初版脚本。
- 视频工作台初始对话文案已同步提示“有明确要求先补充，没有则先生成初版脚本”。
- 视频工作台用户可见文案已避免使用 `CTA`，改为用户更容易理解的“结尾引导”。
- 当前视频工作台开场话术为：“你可以补充想要的开头、口吻、镜头或结尾引导；没有特别要求的话，我就先结合已有信息生成一版初稿。”
- `parseScriptProductionAgentResponse` 在模型输出不可用时返回 `parse_error`，不再用默认脚本补齐。
- `generateVideoScriptVersionWithAgent` 在以下情况会抛出明确 API 错误，不再返回 deterministic fallback 脚本：
  - `SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED`
  - `SCRIPT_PRODUCTION_MODEL_UNAVAILABLE`
  - `SCRIPT_PRODUCTION_MODEL_OUTPUT_INVALID`
- 新增 `SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED_MESSAGE` 和 `isScriptProductionModelConfigured`，测试覆盖“未接入大模型，请检查是否接入大模型后再生成脚本。”的提示口径。
- 追加脚本 Agent 三类测试场景：
  - 简单问题：`needs_more_info` 不生成脚本版本，只返回追问。
  - 需要工具的问题：`ready` 返回单个可用 `version`。
  - 工具失败的问题：`tool_failed` 返回 `toolName / reason / recoverable`，不生成 fallback 脚本。
- Prompt 输出 schema 已从 `ready | needs_more_info` 扩展为 `ready | needs_more_info | tool_failed`。
- `parseScriptProductionAgentResponse` 已支持结构化 `tool_failed`，不再把工具失败混成普通解析失败。
- `generateVideoScriptVersionWithAgent` 会把 `tool_failed` 映射为 `SCRIPT_PRODUCTION_TOOL_FAILED` API 错误，便于前端暴露可诊断原因。

## 改动文件

- `app/src/components/merchant/video-workbench.tsx`
- `app/src/components/platform-admin/platform-settings-editor.tsx`
- `app/src/contracts/knowledge.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/server/api/schemas.ts`
- `app/src/server/api/video-script-production-agent.ts`
- `app/src/server/api/video-script-production-agent.test.ts`
- `app/src/server/api/platform-settings-schema.test.ts`
- `app/supabase/migrations/202604280001_script_production_agent_settings.sql`

## 验证结果

- 通过：`node --conditions react-server --test src/server/api/video-script-production-agent.test.ts src/server/api/platform-settings-schema.test.ts`
  - 13 tests passed。
- 通过：`corepack pnpm lint`
- 通过：`git diff --check -- app/src/server/api/video-script-production-agent.ts app/src/server/api/video-script-production-agent.test.ts app/src/server/api/content-generation-service.ts`
- 未通过：`corepack pnpm typecheck`
  - 阻塞原因：本轮开始前已存在的未跟踪文件 `app/src/lib/ui/video-job-status-copy.test.ts` 第 20 行有 `string | undefined` 传给 `string` 的类型错误。
  - 本轮脚本 Agent 相关文件没有在 typecheck 输出中新增错误。

## 状态

- Branch：`master`
- Commit：未提交。
- Push / merge：未 push，未 merge。
- Supabase migration：仅修改仓库 migration 文件，未 apply 到 staging。
- 参考上下文：`docs/handoff/2026-04-30-script-agent-redesign-context-handoff.md`

## 下一步建议

- 如果要继续验收脚本 Agent，优先检查视频工作台生成脚本时的实际模型返回是否符合 `version` schema。
- 如果要做全量 typecheck，需要先处理任务外未跟踪文件 `app/src/lib/ui/video-job-status-copy.test.ts` 的类型错误。
- 当前没有 commit / push / merge；建议用户确认后再决定是否提交或合并。
