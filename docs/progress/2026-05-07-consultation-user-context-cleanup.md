# 2026-05-07 咨询台用户语境与兜底清理

## 目标

修复 `ywangyangw1@163.com` 新账号咨询台被旧本地生活/商家模板污染的问题，并把咨询链路从“商家资料”语境改为“用户信息”语境。

## 根因

- 实际会话里出现的“到店咨询、私信转化、账号人设种草”不是线上 active agent.md 生成的，而是代码里的业务型 fallback reply 生成的。
- 右侧策略资产也保留了旧标题，如“商家策略资产”“高价值用户洞察”。
- 咨询工具展示文案仍使用“读取商家资料”“检索平台方法论与商家上下文”。

## 已完成

- 删除咨询正文的业务型代码兜底，只保留模型不可用或运行错误时的错误提示。
- 删除策略资产里的 `buildFallbackPositioning` / `buildFallbackCurrentSuggestion`，避免代码替 Agent 拼业务定位和建议。
- 咨询工具、右侧策略资产、设置页、用户知识库统一改为用户语境。
- 设置页移除联系人、联系电话、地址输入。
- 新增 Supabase migration：启用 `initial_consultation_agent` 的 `agent.md v4` 与 `soul.md v3`，强调资料不足先追问、用户纠偏时先承认并移除错误框架。
- 清理 `ywangyangw1@163.com` 的线上污染数据：删除 2 条旧咨询会话，重置 `young` 的策略资产为中性空资产。

## 验证

- `node --test src/server/api/consultation-service.test.ts`：31/31 通过。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `git diff --check`：通过。
- `supabase db push --dry-run`：远端已是最新。
- 线上查询确认 active prompt 为 `agent.md v4`，active soul 为 `soul.md v3`，active prompt 不含“本地生活服务/到店/客流”。
- Vercel production deploy：`https://jingjing-content-platform-staging-cwqnd5w62.vercel.app`，别名 `https://jingjing-content-platform-staging.vercel.app`，`vercel inspect` 状态为 Ready。

## 数据状态

- 账号：`ywangyangw1@163.com`
- 用户资料：`young`
- 行业、服务项、CTA、联系人、联系电话、地址均为空。
- 咨询会话数已重置为 0。
- 策略资产标题为 `# 策略资产`，目标章节为 `目标对象洞察`。
