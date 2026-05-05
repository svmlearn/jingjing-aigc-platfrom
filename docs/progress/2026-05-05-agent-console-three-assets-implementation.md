# 2026-05-05 Agent Console 三件套资产实现记录

## 1. 背景

本轮补齐用户指出的三个缺口：

1. `soul.md` 还没做。
2. `agent.md` 语义已具备，但 Agent Console UI 还没改名。
3. Agent Console 三件套页面结构没完成。

实现范围按短期可落地版本收敛：

- `agent.md`：复用既有 `agent_prompt_versions` 草稿 / 发布 / 回滚生命周期。
- `soul.md`：新增独立版本表、API、后台 UI，并在咨询 runtime 注入 active 版本。
- `memory.md`：只做页面结构占位，不新增长期记忆表，不自动写入，不注入 runtime。

## 2. 已完成

### 2.1 agent.md UI 改名

- Agent 配置页将原 `System Prompt` 面板呈现为 `agent.md`。
- 相关保存 / 发布 / 回滚提示改为 `agent.md`。
- Agent 启用 gate 的错误提示改为“请先创建并发布 agent.md，再启用 Agent”。
- 调试台配置快照将 Prompt 版本改为 `agent.md`。

### 2.2 soul.md 生命周期

- 新增 migration：`agent_soul_versions`。
- 支持每个 Agent 最多一个 `draft`、一个 `active`。
- 支持版本号、变更说明、创建时间、生效时间、归档时间。
- 后台 API：
  - `POST /api/platform-admin/agents/[agentId]/soul-draft`
  - `POST /api/platform-admin/agents/[agentId]/publish-soul`
  - `POST /api/platform-admin/agents/[agentId]/rollback-soul`
- Agent 复制时同步 active / draft `soul.md`。

### 2.3 Agent Console 三件套页面

- Agent 配置页现在按资产结构展示：
  - `agent.md`
  - `soul.md`
  - `memory.md`
- `soul.md` 面板具备草稿、生效版本、历史版本、保存草稿、发布、回滚。
- `memory.md` 面板明确为 V2 占位，当前 `runtimeInjection: disabled`。

### 2.4 runtime 接入

- `resolveConsultationAgentRuntime()` 读取 `agent_soul_versions`。
- 真实咨询使用 active `soul.md`。
- 后台调试使用 draft 优先、active 兜底，和 `agent.md` 调试语义一致。
- 最终回复与策略资产 editor 的 system message 都注入 `buildAgentSoulPrompt()`。
- runtime event、context injection、snapshot tool summary 记录 `activeSoulVersion` / `soulVersionId`。
- runtime snapshot 的 `agentAssetVersions` 记录：
  - `agentMdVersionId`
  - `agentMdVersionNo`
  - `soulMdVersionId`
  - `soulMdVersionNo`
  - `memoryMdPolicy: placeholder_not_injected`

## 3. 未做

- 未新增长期记忆表。
- 未做自动记忆写入。
- 未做 memory candidates / 晋升 / 审批流。
- 未部署 Supabase migration 到远端环境。
- 未 push / merge / deploy。

## 4. 验证结果

已通过：

```bash
cd app && node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint
cd app && npm run build
```

结果：

- 37 条结构测试通过。
- TypeScript typecheck 通过。
- ESLint 通过。
- Next.js production build 通过。
- build 路由表已包含 `publish-soul`、`rollback-soul`、`soul-draft`。

## 5. 风险与注意

- 远端环境必须先应用 `202605050002_agent_soul_versions.sql`，否则 `soul.md` API 和 runtime 读取会依赖不存在的表。
- `memory.md` 当前只是显式占位，不代表长期记忆闭环已经实现。
- 历史 PRD / 设计稿里仍有 `System Prompt` 文字，本轮只改当前 Agent Console 实现，不回写历史资料。
