# 2026-05-22 咨询 Agent 上下文 / 工具 / Skill 边界改造 Handoff

## 当前目标

实现第一阶段结构性修复：咨询 Agent 不再把“读取用户信息”和“读取历史内容”作为 LLM 可见工具；用户资料和会话历史改为 runtime 自动上下文；当前用户原话作为独立 user message；active Skill 正文不再启发式进入 system prompt。

## 已完成内容

- 从配置层和 runtime 可见工具链路移除 `read_merchant_profile` / `read_history`。
- 新默认工具为：`retrieve_knowledge_base`、`search_benchmark_materials`、`update_strategy_snapshot`、`update_content_calendar`。
- 旧 settings 里残留的两个伪工具会在 `toConsultationToolArray()` 中被过滤，过滤后为空时回退新默认值。
- 新增统一模型消息 builder：普通回复、native tool calling、JSON tool loop 共用同一套 system/context/history/current-user 结构。
- 新增 runtime context message：包含用户资料、会话摘要与历史、专家路由、策略资产、本轮 selected evidence、工具结果摘要。
- 当前用户消息最后单独进入模型，不再只藏在 JSON `userMessage` 字段。
- Skill catalog 保留短目录并加预算；active Skill 正文不再由 service 注入 system prompt。
- 严格 schema 保持 `.strict()`；未使用 `.strip()`。
- `native_tool_call_rejected` 仍记录为内部 trace，不作为商家可见失败卡片。
- Review 补丁：`strategySnapshotContext` 不再暴露 raw `strategyTags`、`contentCalendarGeneration` 和内部 generation/id 字段，改为 `contentCalendarStatus` / `contentCalendarNotice` 业务态摘要。

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
- `docs/progress/2026-05-22-consultation-context-boundary-impl.md`
- `docs/handoff/2026-05-22-consultation-context-boundary-impl-handoff.md`

## 验证结果

在 `app/` 目录：

- `pnpm install --frozen-lockfile --offline`：通过
- `node --test src/server/api/consultation-service.test.ts`：通过，55/55
- `pnpm typecheck`：通过
- `pnpm lint`：通过，0 errors；10 warnings 为既有 unused imports/vars

## 分支与提交

- worktree：`/Users/wy/Desktop/静境/静境4.0/jingjing-consultation-context-boundary-impl`
- branch：`ai/consultation-context-boundary-impl`
- base：`codex/agent-tool-schema-fix` (`5d67451`)
- commit：当前提交；最终 hash 以交付说明和 `git log -1` 为准
- push / merge：未 push，未 merge

## 下一步建议

1. 由后续 AI / 人工 reviewer 做 code review。
2. review 重点：runtime context message 的信息量、历史消息去重、Skill 正文不进入 system、旧 settings 过滤是否符合预期。
3. 通过 review 后由集成人决定 cherry-pick / merge，不建议在本 worktree 直接合并主线。
