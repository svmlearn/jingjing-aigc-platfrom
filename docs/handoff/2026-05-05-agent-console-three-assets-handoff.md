# 2026-05-05 Agent Console 三件套资产 Handoff

## 当前目标

完成用户指定的三个优先项：

1. 实现 `soul.md`。
2. 将 Agent Console 里的既有 prompt UI 改名为 `agent.md`。
3. 补齐 Agent Console `agent.md / soul.md / memory.md` 三件套页面结构。

## 已完成

- `agent.md`：沿用既有 `agent_prompt_versions`，UI 和提示文案已改名。
- `soul.md`：新增 `agent_soul_versions` migration、DTO、repository、API route、后台 UI。
- `memory.md`：新增后台占位面板，明确本轮不注入 runtime。
- runtime：active `soul.md` 已进入真实咨询 system prompt；调试台支持 draft 优先。
- 快照：runtime snapshot/tool summary 记录 `agentAssetVersions` 和 `soulVersionId`。
- 测试：补了 Agent Console 三件套和 runtime `soul.md` 注入结构测试。

## 改动文件

- `app/supabase/migrations/202605050002_agent_soul_versions.sql`
- `app/src/contracts/agent-console.ts`
- `app/src/lib/db/agent-console-repository.ts`
- `app/src/server/api/schemas.ts`
- `app/src/app/api/platform-admin/agents/[agentId]/soul-draft/route.ts`
- `app/src/app/api/platform-admin/agents/[agentId]/publish-soul/route.ts`
- `app/src/app/api/platform-admin/agents/[agentId]/rollback-soul/route.ts`
- `app/src/app/platform-admin/agents/page.tsx`
- `app/src/app/platform-admin/debug/page.tsx`
- `app/src/components/platform-admin/agent-console-pages.tsx`
- `app/src/server/api/consultation-runtime/types.ts`
- `app/src/server/api/consultation-runtime/experts.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/events.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/agent-console-admin.test.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/progress/2026-05-05-agent-console-three-assets-implementation.md`
- `docs/handoff/2026-05-05-agent-console-three-assets-handoff.md`

## 验证结果

已通过：

```bash
cd app && node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint
cd app && npm run build
```

## 未完成 / 后续建议

- 远端部署前先应用 Supabase migration。
- `memory.md` 后续需要单独设计：写入策略、候选记忆、审核、回滚、runtime 注入边界。
- 如要上线，需要再做一次浏览器验收，重点看 `/platform-admin/agents` 和 `/platform-admin/debug` 的实际页面布局。

## Branch / Worktree

- Worktree：`/Users/wy/.codex/worktrees/consultation-expert-traffic-v1`
- Branch：`codex/consultation-expert-traffic-v1`
- 已合并：已 fast-forward 到主目录 `main`
- Push：已推送 `origin/main` 和 `gitee/main`
- Supabase：已应用 `202605050002_agent_soul_versions.sql`
- Vercel：已部署 production alias `https://jingjing-content-platform-staging.vercel.app`
- Deployment URL：`https://jingjing-content-platform-staging-qalylsnv8.vercel.app`
- Inspect URL：`https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/DzyHdk9NGw12z32Gf2ez2zFcY4aK`
