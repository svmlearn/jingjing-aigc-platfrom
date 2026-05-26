# 2026-05-26 consultation history delete loading fix

## Scope

- worktree：`/Users/wy/.codex/worktrees/consultation-history-delete-loading-fix`
- branch：`codex/consultation-history-delete-loading-fix`
- base：`main @ b316e79`
- long-task-gate：disabled
- subagent：未使用；任务 A 是单文件前端状态修复

本次只处理删除咨询聊天记录后历史抽屉反复进入“正在读取咨询聊天记录...”的问题，不处理策略资产物理拆分、`currentSuggestion` 迁移或商家资料上下文瘦身。

## Root Cause

`app/src/components/merchant/consultation-workspace.tsx` 中原有 `loading` 同时承担三类含义：

1. 会话列表首次加载。
2. 会话列表后台刷新。
3. 主会话区是否仍在加载。

删除历史记录成功后，前端又无条件 `await loadSessions()`，而 `loadSessions()` 会重置 `sessionsLoaded=false` 并把 `loading=true`。历史抽屉 UI 直接用同一个 `loading` 展示整块“正在读取咨询聊天记录...”，所以删除后即使已有列表，也会被完整 loading 态覆盖。

删除最后一个会话时，这个重载流程还会撞上“列表为空自动新建会话”的 effect，造成“删除 -> 重新读取 -> 自动新建 -> 再重新读取”的观感。

后端 `DELETE /api/consultation/sessions/[sessionId]` 和 `deleteConsultationSession` 已按当前用户/商家隔离删除，未发现本次必须修改的后端问题。

## Changes

改动文件：

- `app/src/components/merchant/consultation-workspace.tsx`

已落地：

1. 拆分加载状态：
   - `sessionsLoading`：会话列表首次/阻塞式加载。
   - `sessionsRefreshing`：会话列表后台刷新。
   - `sessionLoading`：当前会话详情加载。
2. `loadSessions()` 增加后台刷新模式；后台刷新不再重置 `sessionsLoaded`，历史抽屉保留当前列表或空态，只在标题区显示轻量“同步中”。
3. 历史抽屉只在“首次列表尚未加载完成”时显示整块“正在读取咨询聊天记录...”。
4. 删除成功后先做乐观更新：
   - 从 `sessions` 中即时移除被删会话。
   - 删除非当前会话时不影响当前对话。
   - 删除当前会话且仍有其他会话时，自动切到剩余列表中最近的一条。
   - 删除当前会话且没有其他会话时，清空当前会话并抑制这一次自动新建，历史抽屉稳定显示空态；用户仍可点“新开对话”创建。
5. 删除成功后触发后台刷新，但不阻塞抽屉内容区。
6. 增加 `sessionRequestSequence`，在删除当前会话或切换会话时忽略过期的详情请求，避免被已删除会话的迟到响应污染 UI。

## Validation

已执行并通过：

```bash
git diff --check
cd app && npm run typecheck
cd app && npm run lint
cd app && NEXT_TELEMETRY_DISABLED=1 npm run build
```

说明：

- 新 worktree 初始没有 `node_modules`，第一次 `npm run typecheck` 失败于 `tsc: command not found`。随后执行 `corepack pnpm install --frozen-lockfile`，依赖全部复用本机缓存，没有下载新增包；之后 typecheck/lint/build 均通过。
- 未做真实浏览器删除点击验证。原因是本地 dashboard 需要应用会话 / PostgreSQL 登录环境，直接用真实账号做删除流会修改真实咨询记录。建议后续在 throwaway 商家账号或明确授权的数据集上做浏览器验收。

## Push / Merge

- 未 push。
- 未 merge。
- 未部署服务器。
