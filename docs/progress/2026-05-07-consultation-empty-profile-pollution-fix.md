# 2026-05-07 咨询 Agent 空资料污染修复记录

## 背景

用户新注册商家账号 `ywangyangw1@163.com`，商家名 `young`。进入咨询台后，右侧策略资产和 Agent 回复出现“本地服务 / 本地生活服务 / 高意向用户”等默认结论。

## 排查结论

该账号商家基础资料为空：

- `industry = null`
- `service_items = []`
- `brand_summary = null`
- `region_summary = null`
- `default_cta = []`

污染不是用户资料填写错误，而是咨询会话创建时，代码用空资料生成了初始策略快照：

- `buildGreetingMessage` 空资料时兜底为 `本地服务`
- `buildStrategySnapshot` 空资料时兜底为 `本地生活服务`
- 平台默认咨询 Agent prompt / active prompt 仍写着“本地生活商家”

后续 Agent 把这份错误策略资产作为共享事实层读取，导致回复继续围绕本地生活服务展开。

## 本轮修复

代码分支：

- `codex/fix-empty-consultation-strategy`

改动文件：

- `app/src/server/api/consultation-service.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/supabase/migrations/202605070003_consultation_empty_profile_guardrails.sql`

主要变更：

- 新增空资料判断：没有主营业务、行业、品牌摘要、地区摘要、CTA 时，初始化为空策略资产。
- 空资料首轮问候改为先追问“你是谁、主要做什么、想解决什么问题”，不再假设行业。
- 策略快照生成移除 `本地服务 / 本地生活服务 / 高意向用户 / 到店转化` 等空资料默认结论。
- 平台默认咨询 Agent prompt 改为中性口径：资料不足先追问，不假设行业、门店类型或本地化服务。
- 新增 migration，同步修正线上默认 prompt 和初始咨询 Agent role description。
- 增加源码契约测试，防止空资料再次写入本地服务兜底。

## 线上数据处理

处理范围限定：

- 邮箱：`ywangyangw1@163.com`
- 商家：`young`
- merchant_id：`e9a7fd77-a305-4b1e-adf7-446a0f93aa4d`

已执行：

- 保留商家基础资料，不修改用户填写信息。
- 删除该商家 2 条由错误兜底生成的咨询会话。
- 将该商家的 `merchant_strategy_assets` 重置为空策略资产。
- 将线上 active consultation prompt 改为中性口径。

验证结果：

- `deletedConsultationSessionCount = 2`
- `sessionsAfterCount = 0`
- `strategySnapshot.positioning = ""`
- `coreSellingPoints = []`
- `targetAudiences = []`
- `contentCalendarDraftCount = 0`
- `strategy_markdown` 不再包含 `本地生活服务 / 本地服务`
- active prompt 不再包含旧的“目标是帮助本地生活商家”

## 验证命令

已通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && pnpm typecheck
cd app && pnpm lint
git diff --check
```

## 未做

- 未 push。
- 未 merge。
- 未部署。

