# 2026-05-01 商家级策略资产归属修复 Handoff

## 当前目标

修复咨询台右侧「我的策略资产」随新开对话 / 切换历史记录变化的问题。

产品结论：

- 策略资产是商家级长期资产。
- 咨询对话只是编辑入口和历史记录。
- 会话快照可保留作追溯，但不再作为右侧资产真相源。

## 已完成

新增商家级策略资产表和仓储：

- `app/supabase/migrations/202605010002_merchant_strategy_assets.sql`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`

新增共享解析工具：

- `app/src/lib/strategy-snapshot.ts`

调整咨询服务：

- `listConsultationSessionsForUser()` 返回商家级 `strategySnapshot`。
- `createConsultationSessionForUser()` 新建对话时优先继承 / 初始化商家级资产。
- `getConsultationSessionForUser()` 返回详情时用商家级资产覆盖会话快照。
- `sendConsultationMessageForUser()` 用商家级资产作为当前策略上下文，并把 Agent 更新结果写回商家级资产。
- 当前会话仍同步写入 `consultation_sessions.strategy_snapshot`，用于追溯。

调整内容生成服务：

- 图文 / 视频生成读取咨询上下文时，用商家级策略资产覆盖会话快照。
- 草稿 `input_snapshot.strategySnapshot` 仍固化生成当时的策略快照。

补充记录：

- `docs/progress/2026-05-01-merchant-strategy-asset-scope.md`

## 验证结果

已执行：

```bash
cd app
node --test src/server/api/consultation-service.test.ts
npm run typecheck
npm run build
```

结果：

- `consultation-service.test.ts`：7 项通过。
- `tsc --noEmit`：通过。
- `next build`：通过，页面 `48/48`。

## 发布结果

已执行远端数据库迁移和 staging 部署。

Supabase：

- `202605010002_merchant_strategy_assets.sql` 已推送到 remote。
- `supabase migration list` 显示 Local / Remote 均包含 `202605010002`。

Vercel：

- Deployment：`https://jingjing-content-platform-staging-g2a14mlri.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- `vercel inspect` 状态：`Ready`

HTTP smoke：

- `/`：200
- `/login`：200
- `/platform-admin-login`：200

## 下一步建议

1. 确认当前工作区其他未提交改动归属。
2. 在商家端浏览器验证：
   - 旧会话 A 写入策略资产。
   - 新开对话 B，右侧仍显示 A 写入后的资产。
   - 切回历史会话 A / B，右侧资产保持一致。
   - 在 B 中继续修改资产后，A 再打开也显示最新资产。

## Push / Merge 状态

- 未 commit。
- 未 push。
- 未 merge。
- Supabase migration 已推送远端 staging。
- Vercel staging 已部署。
