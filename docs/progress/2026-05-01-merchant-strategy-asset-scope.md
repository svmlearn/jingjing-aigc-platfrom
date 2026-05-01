# 2026-05-01 商家级策略资产归属修复

## 背景

W 反馈：新开对话或切换不同咨询历史时，右侧「我的策略资产」会变成不同内容。

产品判断：

- 策略资产 / 内容资产不应该被咨询对话重置。
- 咨询对话只是编辑入口和历史记录。
- 商家的策略资产应该是商家级长期资产，跨对话共享。

## 根因

旧实现把右侧资产直接存在 `consultation_sessions.strategy_snapshot`。

因此：

- 新开对话会初始化一份新的 `strategySnapshot`。
- 切换历史会话时，前端读取当前 `session.strategySnapshot`。
- 不同会话天然显示不同右侧资产。

## 本轮变更

新增商家级策略资产表：

- `merchant_strategy_assets`
- 主键：`merchant_id`
- 字段：`strategy_snapshot jsonb`

新增迁移：

- `app/supabase/migrations/202605010002_merchant_strategy_assets.sql`

迁移会用每个商家最近一条咨询会话的 `strategy_snapshot` 初始化商家级资产。

新增仓储：

- `app/src/lib/db/merchant-strategy-asset-repository.ts`

服务层调整：

- 新建咨询会话时，优先读取 / 初始化商家级策略资产。
- 发送咨询消息时，用商家级资产作为当前策略上下文。
- `update_strategy_snapshot` 工具产出的新资产同时写回商家级资产和当前会话快照。
- 获取咨询详情和列表时，返回给前端的 `strategySnapshot` 使用商家级资产。
- 图文 / 视频生成服务从咨询会话读取上下文时，也覆盖为商家级策略资产。

保留：

- `consultation_sessions.strategy_snapshot` 仍保留，作为当时会话 / 内容生成追溯用的快照，不再作为右侧资产真相源。

## 验收标准

- 新开对话后，右侧「我的策略资产」不清空、不回到默认值。
- 切换任意咨询历史，右侧策略资产保持同一份商家级资产。
- 在任一对话中让 Agent 修改策略资产，其他对话再打开时也显示最新资产。
- 从内容日历进入图文 / 视频工作台时，生成接口使用商家级当前策略资产，并在草稿 `input_snapshot` 中固化当时快照。

## 验证

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

## 发布

本轮新增 Supabase migration 已推送远端 staging：

- `app/supabase/migrations/202605010002_merchant_strategy_assets.sql`

执行：

```bash
cd app
supabase migration list
supabase db push
supabase migration list
vercel deploy --prod --yes
```

结果：

- Supabase remote 已包含 `202605010002`。
- Vercel deployment：`https://jingjing-content-platform-staging-g2a14mlri.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- `vercel inspect` 状态：`Ready`
- HTTP smoke：
  - `/`：200
  - `/login`：200
  - `/platform-admin-login`：200
