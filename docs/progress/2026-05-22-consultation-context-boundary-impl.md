# 2026-05-22 咨询 Agent 上下文 / 工具 / Skill 边界改造执行记录

## 基本信息

- 分支：`ai/consultation-context-boundary-impl`
- worktree：`/Users/wy/Desktop/静境/静境4.0/jingjing-consultation-context-boundary-impl`
- 基线：`codex/agent-tool-schema-fix` (`5d67451`)
- 状态：已完成第一阶段结构性修复，待 code review / 待合并决策
- push / merge：未 push，未 merge

## 执行范围

本轮严格按 `docs/架构规范/2026-05-22-Claude-Code上下文工具Skill机制调研与咨询Agent改造指引.md` 执行，未重新发散设计。

已完成：

1. 从合同、schema、默认设置、平台设置 UI、runtime registry、business prompt、native tools、planner 顺序和依赖中移除 `read_merchant_profile` / `read_history`。
2. 保留旧 settings 兼容：repository 读取时通过 `consultationAgentToolKeys` 过滤旧 key；过滤后为空则回退新默认工具。
3. 新增 `buildConsultationRuntimeContextMessage()`，把 `merchantProfileContext`、`conversationContext`、`expertRoutingContext`、`strategySnapshotContext`、`selectedKnowledgeContext`、`toolResultsContext` 渲染为独立 runtime context message。
4. 新增统一 `buildConsultationModelMessages()`，普通回复、native tool calling、JSON tool loop 共用 `system -> runtime context -> history -> current user` 的消息结构。
5. 当前用户输入作为最后一条独立 `role=user` message 进入模型，不再只作为大 JSON 的 `userMessage` 字段。
6. 停止把 active Skill 正文和 Skill reference 默认塞进 system prompt；`activeSkills` 本轮默认置空，保留短 Skill catalog。
7. `buildSkillCatalogPrompt()` 增加 8k 总预算和单项截断。
8. 严格工具 schema 保持 `.strict()`；没有引入 `.strip()`。
9. `native_tool_call_rejected` 仍保留 trace，但继续被 `isMerchantVisibleToolResult()` 从商家可见失败卡过滤。

## 改动文件

- `app/src/contracts/knowledge.ts`
- `app/src/server/api/schemas.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/components/platform-admin/platform-settings-editor.tsx`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-runtime/planner.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/skills.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`

## 验证结果

在 `app/` 目录执行：

- `pnpm install --frozen-lockfile --offline`：通过
- `node --test src/server/api/consultation-service.test.ts`：通过，55/55
- `pnpm typecheck`：通过
- `pnpm lint`：通过，0 errors；仍有 10 个既有 unused warning，涉及 `current-user.ts`、`content-draft-repository.ts`、`video-edit-job-repository.ts`

补充源码扫描：

- app runtime 可见路径中未保留 `read_merchant_profile` / `read_history` 的 registry、dispatch、planner 逻辑。
- `app/src/contracts/knowledge.ts` 仅以 `legacyConsultationAgentToolKeys` 形式保留旧 key，用于说明旧 settings 兼容边界。

## Review 修复记录

2026-05-22 review 后补充修复：

1. `buildConsultationRuntimeContextMessage()` 的 `strategySnapshotContext` 不再暴露 raw `strategyTags`。
2. `buildConsultationRuntimeContextMessage()` 不再暴露 raw `contentCalendarGeneration` 对象，以及 `currentRevisionId`、`generatedFromRevisionId`、`generatedBatchId`、`generatedAt`、`generatedJobCount` 等内部字段。
3. 改为模型可理解的业务态摘要：`contentCalendarStatus` 和 `contentCalendarNotice`。
4. 补测试锁定 runtime context message builder 中不出现内部 generation/id 字段，并出现业务态摘要字段。

## 后续建议

1. code review 重点看 `buildConsultationRuntimeContextMessage()` 的上下文块预算是否足够保守。
2. 后续如果要继续做 Skill，可按调研文档第二阶段实现显式 `activate_consultation_skill`，不要恢复启发式正文注入。
3. 合并前建议用一条真实咨询对话手动验证：前台不出现伪读工具卡，模型能基于用户资料和历史继续回答。
