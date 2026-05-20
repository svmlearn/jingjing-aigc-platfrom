# 2026-05-20 团队选题 Agentic RAG 执行记录

## 目标

围绕团队选题和内容日历生成链路，先不新增 Dify YAML 输入字段，优化：

1. 咨询台 native tool loop 中读类工具可多轮调用。
2. 知识库检索从单次 chunk topK 升级为 direct / keyword / vector 混合策略。
3. 内容日历 item 沉淀隐藏生成上下文，并在生成团队内容时进入现有 Dify 输入。

## 执行范围

worktree：`/Users/wy/.codex/worktrees/team-topic-agentic-rag`
branch：`codex/team-topic-agentic-rag`
基线：`90aeca2 docs: add consultation kb rag handoff`

## 已完成

1. 新增 PRD：`docs/产品文档/V2.5-团队选题Agentic-RAG与日历上下文沉淀PRD.md`。
2. `retrieve_knowledge_base`、`read_merchant_profile`、`read_history` 在 native tool calling loop 中不再因用过一次就从 tools 列表移除。
3. `retrieveConsultationKnowledge` 改为混合检索：
   - 明确读知识库时直读用户 indexed 文档。
   - 始终保留 keyword scan。
   - 有 embedding 时并行跑 vector scan。
   - 多路结果按来源交错合并、按 chunk 去重，并在 metadata 中记录 `retrievalSource`。
4. 多次 RAG tool result 不再覆盖 `state.knowledgeMatches`，而是按 chunk 去重累积。
5. `ContentCalendarGuidanceDto` 增加隐藏字段：
   - `shotConstraints`
   - `assetCapabilityHints`
   - `retrievalTrace`
6. daily task 创建时把隐藏 guidance 字段带入检索 query 和 `team_calendar_guidance` knowledge ref。
7. Dify batch 输入组装继续使用现有字段：
   - `calendar_task_json` 增加 `videoAssetCapabilities`。
   - `fallback_knowledge_text` 增加素材能力与镜头边界文本。
   - `image_assets_json` 仍只承载图文图片素材。
   - 未新增 `video_asset_capabilities_json` 等 YAML Start 输入。

## 验证

已通过：

```bash
cd app
node --test src/lib/content-calendar-guidance.test.ts
node --test src/server/api/consultation-service.test.ts
npm run typecheck
npm run lint
npm run build
```

说明：

1. 初次 `npm run typecheck` 因 worktree 未安装依赖，`tsc: command not found`。
2. 曾临时用主目录 `node_modules` symlink 验证，`next build` 被 Turbopack 拒绝跨项目 symlink。
3. 已移除 symlink，并执行 `pnpm install --frozen-lockfile` 在 worktree 本地安装依赖后，`typecheck`、`lint`、`build` 全部通过。

## 未做

1. 未修改 Dify YAML。
2. 未新增 Dify Start 输入字段。
3. 未修改内容日历 UI 展示层。
4. 未 push。
5. 未 merge 回主目录。
