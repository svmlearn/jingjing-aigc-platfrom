# 2026-04-30 脚本制作 Agent DeepSeek 解析修复 Handoff

## 当前目标

只给脚本制作 Agent 接 DeepSeek，用于本地生成视频脚本；咨询工作台仍保持不接大模型。跳过上传、视频生成和 worker。

## 已完成

- `createChatCompletion` 支持 `response_format: { type: "json_object" }`，当前仅脚本制作 Agent 调用使用。
- 新增 `script-production-runtime`，脚本 Agent 独立读取 `VIDEO_WORKBENCH_LLM_*` / `DEEPSEEK_API_KEY`，不依赖咨询工作台通用 LLM key。
- 脚本 Agent runtime 将输出上限提升到至少 `5000` tokens，避免 DeepSeek 生成完整脚本 JSON 时被 `1800` tokens 截断。
- 脚本 brief 新增 `ctaOptions`，由商家默认 CTA / 图文 brief CTA 带入，避免模型误判缺 CTA。
- 解析器兼容 DeepSeek 常见字段别名，例如 `cta`、`callToAction`、`rationale`、`scenePlan`、`picture`、`dialog`、`assets`。
- 移除“必须命中 brief 原词”的硬失败，避免模型同义改写后被误判为格式无法解析。

## 验证结果

- 通过：`node --experimental-strip-types --test src\server\api\script-production-runtime.test.ts`
- 通过：`node --experimental-strip-types --test --test-name-pattern "validateScriptProductionBrief|parseScriptProductionAgentResponse|agent test case|script production model configuration" src\server\api\video-script-production-agent.test.ts`
- 通过：直接调用 DeepSeek `deepseek-v4-flash`，`max_tokens=5000` + JSON object，解析为 `llm`，返回 4 个分镜。
- 通过：本地 API `POST /api/content/video-scripts` 返回 `201`，生成脚本草稿、选中脚本 variant 和 6 个分镜。
- 通过：`GET /dashboard` 返回 `200`，服务运行在 `http://127.0.0.1:3002/`。
- 未全量通过：`tsc --noEmit` 仍被任务外既有文件 `src/lib/ui/video-job-status-copy.test.ts(20,16)` 阻塞。
- 未全量通过：`video-script-production-agent.test.ts` 全文件当前还有一组未完成的 `activePromptCards / 规则目录` prompt 新契约，与现有实现不一致；本轮只验证了解析和 runtime 相关用例。

## 当前服务

- 端口：`3002`
- 日志：`.tmp/local-script-model-dev/next-dev-3002.out.log`
- 咨询工作台通用 LLM：未接入，`/api/platform-admin/settings` 显示 `llmRuntime.apiKeySource = none`
- 脚本制作 Agent：通过 video workbench 专用 DeepSeek env 调用

## 改动文件

- `app/src/server/api/ai-runtime.ts`
- `app/src/server/api/script-production-runtime.ts`
- `app/src/server/api/script-production-runtime.test.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/server/api/video-script-production-agent.ts`
- `app/src/server/api/video-script-production-agent.test.ts`

## 状态

- 未 commit
- 未 push
- 未 merge
