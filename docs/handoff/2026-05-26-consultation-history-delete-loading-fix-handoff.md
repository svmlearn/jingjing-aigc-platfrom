# 2026-05-26 consultation history delete loading fix handoff

## Current Goal

修复商家端咨询台删除历史聊天记录后，历史抽屉反复进入完整重新读取状态的问题。

## Worktree / Branch

- worktree：`/Users/wy/.codex/worktrees/consultation-history-delete-loading-fix`
- branch：`codex/consultation-history-delete-loading-fix`
- base：`main @ b316e79`
- long-task-gate：disabled
- subagent：未使用
- push：未 push
- merge：未 merge
- deploy：未部署

## Completed

1. 将咨询 workspace 的加载状态从单个 `loading` 拆成：
   - 会话列表阻塞加载：`sessionsLoading`
   - 会话列表后台刷新：`sessionsRefreshing`
   - 当前会话详情加载：`sessionLoading`
2. 历史抽屉不再因为后台刷新或删除后的列表同步而整块显示“正在读取咨询聊天记录...”。
3. 删除成功后做乐观列表更新：
   - 删除非当前会话：列表即时移除，不切换当前对话。
   - 删除当前会话且仍有其他会话：切到剩余最近会话。
   - 删除当前会话且无其他会话：清空当前会话，历史抽屉稳定空态，并跳过这一次自动新建。
4. 删除后的 `loadSessions()` 改为后台刷新，不阻塞历史抽屉内容区。
5. 会话详情请求增加过期请求防护，避免删除/切换时迟到响应把旧会话写回 UI。

## Changed Files

- `app/src/components/merchant/consultation-workspace.tsx`
- `docs/progress/2026-05-26-consultation-history-delete-loading-fix.md`
- `docs/handoff/2026-05-26-consultation-history-delete-loading-fix-handoff.md`

## Validation

已通过：

```bash
git diff --check
cd app && npm run typecheck
cd app && npm run lint
cd app && NEXT_TELEMETRY_DISABLED=1 npm run build
```

未执行真实浏览器删除点击验证：本地 dashboard 需要真实应用会话 / PostgreSQL 登录环境，而直接用真实账号测试删除会修改真实咨询记录。合并或部署前建议用 throwaway 商家账号补一次浏览器验收：

1. 新建至少 2 个咨询会话。
2. 打开历史记录，删除非当前会话。
3. 删除当前会话。
4. 删除最后一个会话。
5. 确认历史抽屉不会反复卡在“正在读取咨询聊天记录...”。

## Next Step

建议先审查并验收本小分支；通过后再决定是否 cherry-pick / merge 回 main。任务 B“策略资产物理拆分”和任务 C“商家资料上下文瘦身”不要混入本分支。
