# 2026-05-21 V2.7 咨询 Agent 上下文工程瘦身实现 Handoff

## 当前目标

按 `docs/产品文档/V2.7-咨询Agent上下文工程瘦身PRD.md` 的 P0/P1/P2 方向，先落地咨询 Agent 主模型上下文瘦身：

1. 主模型 user JSON 不再携带 `contextInjection`、重复 `toolResults/priorToolResults`、`skillDisclosure`、budget、`expertTraffic`。
2. 用内部 `slim_v2` context pack 选择本轮上下文。
3. RAG evidence 进入主模型前变成 `currentKnowledgeMatches`，并带 query、toolCallId、turn、freshness、evidenceRole。
4. debug/runtimeSnapshot 继续保留 omittedContext、budget、allKnowledgeMatches、toolResults、skillDisclosure、expertTraffic。

## 分支和 worktree

- worktree：`/Users/wy/.codex/worktrees/v27-context-slimming`
- branch：`codex/v27-context-slimming-20260521`
- base：`main@b7efd28`

## 已完成内容

### 1. 新增 slim context pack

修改文件：

- `app/src/server/api/consultation-runtime/context.ts`

新增：

- `ConsultationContextPackMode = "slim_v2"`
- `ConsultationSelectedContextPack`
- `ConsultationContextOmission`
- `ConsultationSelectedKnowledgeMatch`
- `ConsultationSlimContextPack`
- `buildConsultationSlimContextPack`
- `buildSlimContextPackSystemPrompt`

当前 selector 支持：

- `light_chat`
- `strategy_edit`
- `knowledge_answer`
- `calendar_work`
- `benchmark_search`
- `history_reference`

### 2. 替换主模型 payload

修改文件：

- `app/src/server/api/consultation-service.ts`

已替换这些 LLM message builder：

- `buildAssistantReplyWithModel`
- `buildNativeToolCallingMessages`
- `buildJsonToolLoopMessages`
- `buildStrategyAssetEditorMessages`

主模型 user JSON 目标形态已改为：

```json
{
  "merchant": {},
  "userMessage": "...",
  "round": 1,
  "expertRouting": {},
  "strategySnapshot": {},
  "currentKnowledgeMatches": []
}
```

### 3. RAG evidence 元信息

`retrieve_knowledge_base` 返回的 `knowledgeMatches` 现在会写入：

- `query`
- `toolCallId`
- `turn`
- `freshness = "current_turn"`

`buildSelectedKnowledgeMatches` 会选出最多 5 个 selected evidence，并补：

- `evidenceRole`
- `freshness`
- `query`
- `toolCallId`
- `turn`

### 4. debug/runtimeSnapshot 保留

`buildContextBoundarySnapshot` 现在会记录：

- `selectedContext.contextPackMode`
- `selectedContext.selectedContextPack`
- `selectedContext.selectedContextDecision`
- `selectedContext.omittedContext`
- `knowledge.selectedMatchIds`
- `knowledge.selectedMatches`
- all knowledge matches 仍保留在原 `knowledge.matches`

### 5. 测试更新

修改文件：

- `app/src/server/api/consultation-service.test.ts`

新增 / 更新测试覆盖：

- 主 LLM context 改为 slim pack。
- debug-only 字段不再进入 service 主 payload。
- selected evidence 带 query/toolCallId/freshness/evidenceRole。
- 日历已生成团队内容判断文案从 `currentStrategySnapshot` 对齐为 `strategySnapshot`。

## 验证结果

执行目录：`/Users/wy/.codex/worktrees/v27-context-slimming/app`

已通过：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
node --test src/server/api/consultation-service.test.ts
corepack pnpm build
git diff --check
```

说明：

- `corepack pnpm lint` 通过，但保留 10 个既有 unused warning，均不在本轮改动文件内。
- 第一次 build 曾因临时 `node_modules` symlink 被 Turbopack 拒绝；已删除 symlink 并在 worktree 内正常安装依赖后重跑通过。

## 未做事项

1. 未实现平台设置里的 `contextPackMode = slim_v2 | legacy_v1` UI 或持久化配置。
2. 未做生产灰度开关。
3. 未让 selected evidence 由轻量模型选择，目前为规则选择。
4. 未调整平台管理端 debug UI 展示结构，仅保证 runtimeSnapshot 数据已记录。

## 当前状态

状态：代码已实现并验证，待用户验收 / 待合并决策。

本轮不 push、不 merge。

