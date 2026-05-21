# 2026-05-20 团队选题 Agentic RAG 交接

## 当前目标

提升团队选题、内容日历和 Dify 图文/视频脚本生成质量。重点是让咨询台 Agent 能多轮读取知识库，让 RAG 变成检索策略，并把知识与素材边界沉淀进内容日历隐藏上下文。

## 当前分支

worktree：`/Users/wy/.codex/worktrees/team-topic-agentic-rag`
branch：`codex/team-topic-agentic-rag`
基线 commit：`90aeca2 docs: add consultation kb rag handoff`
push：未 push
merge：未 merge

## 已完成内容

1. 写入 PRD：`docs/产品文档/V2.5-团队选题Agentic-RAG与日历上下文沉淀PRD.md`。
2. native tool calling loop 支持读类工具重复调用：
   - `read_merchant_profile`
   - `retrieve_knowledge_base`
   - `read_history`
3. 写类工具仍会被严格移出后续 tools，避免重复写入。
4. RAG 检索升级为混合策略：
   - 用户文档 direct scan
   - keyword scan
   - vector scan
   - 多路交错合并与 chunk 去重
5. 多次知识库检索结果会累积到 `state.knowledgeMatches`，不再被最后一次检索覆盖。
6. 内容日历 guidance 增加隐藏字段：
   - `shotConstraints`
   - `assetCapabilityHints`
   - `retrievalTrace`
7. `shotConstraints` 保留为透传通道，但咨询台代码不再硬生成默认镜头禁令；素材边界由 prompt 约束和真实素材能力共同决定。
8. daily task 和 Dify 输入组装已消费这些隐藏字段。
9. Dify 仍只使用现有输入字段，没有新增 YAML Start input。

## 主要改动文件

代码：

1. `app/src/server/api/consultation-runtime/tools.ts`
2. `app/src/server/api/consultation-runtime/runtime.ts`
3. `app/src/server/api/consultation-runtime/rag.ts`
4. `app/src/server/api/consultation-service.ts`
5. `app/src/contracts/consultation.ts`
6. `app/src/lib/content-calendar-guidance.ts`
7. `app/src/server/api/daily-content-task-service.ts`
8. `app/src/server/api/content-generation-batch-service.ts`

测试：

1. `app/src/lib/content-calendar-guidance.test.ts`
2. `app/src/server/api/consultation-service.test.ts`

文档：

1. `docs/产品文档/V2.5-团队选题Agentic-RAG与日历上下文沉淀PRD.md`
2. `docs/progress/2026-05-20-team-topic-agentic-rag-progress.md`
3. `docs/handoff/2026-05-20-team-topic-agentic-rag-handoff.md`

## 验证结果

已通过：

```bash
cd app
node --test src/lib/content-calendar-guidance.test.ts
node --test src/server/api/consultation-service.test.ts
npm run typecheck
npm run lint
npm run build
```

注意：worktree 本地执行过 `pnpm install --frozen-lockfile`，只生成被忽略的 `app/node_modules`，未改 lockfile。

## 下一步建议

1. 产品验收咨询台团队选题对话：连续查询项目事实、方法论、话术是否自然。
2. 用真实素材库验收 `videoAssetCapabilities`：确认 Dify 脚本画面是否明显收敛到可用素材边界。
3. 如需 UI 提示，再加轻量状态 chip，例如“已参考知识库”“含镜头边界”，但不要展开隐藏字段。
4. 如果用户确认，再由干净集成工作区 cherry-pick 或 merge 本分支。
