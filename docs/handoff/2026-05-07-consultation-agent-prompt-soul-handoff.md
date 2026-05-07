# 2026-05-07 咨询 Agent agent.md / soul.md handoff

## 当前目标

为默认「初始咨询 Agent」补一版可长期维护的 `agent.md` 和 `soul.md`，解决旧提示词过薄、容易在空资料场景脑补“本地生活服务”的问题。

## 已完成内容

- 已在 `main` 直接修改。
- 已完成 GitHub prompt 检索报告：
  - `docs/探索/2026-05-07-consultation-agent-prompt-github-research.md`
- 已新增 Supabase migration：
  - `app/supabase/migrations/202605070004_consultation_agent_prompt_soul.sql`
  - `app/supabase/migrations/202605070005_consultation_agent_prompt_debias_terms.sql`
- 已新增测试：
  - `app/src/server/api/consultation-service.test.ts`
- 已写进展记录：
  - `docs/progress/2026-05-07-consultation-agent-prompt-soul.md`

## 远端状态

Supabase project:

- `jingjing-content-platform-staging`
- project ref: `jrveaabguddromjtibbs`

已执行：

- `supabase db push --yes`

本轮实际应用迁移：

- `202605070003_consultation_empty_profile_guardrails.sql`
- `202605070004_consultation_agent_prompt_soul.sql`
- `202605070005_consultation_agent_prompt_debias_terms.sql`

再次 dry-run：

- `Remote database is up to date.`

## 当前 Agent 配置

`initial_consultation_agent`：

- display name: `初始咨询 Agent`
- role description: `商家战略内容咨询顾问`
- active `agent.md`: v3
- active `soul.md`: v2
- active prompt / soul 不含旧污染词：
  - `本地生活服务`: false
  - `高意向用户`: false
  - `到店`: false
  - `客流`: false

## young 账号复查

账号：

- `ywangyangw1@163.com`

商家：

- `name`: `young`
- `industry`: `null`
- `service_items`: `[]`
- `default_cta`: `[]`
- `region_summary`: `null`
- `brand_summary`: `null`

策略资产：

- `positioning`: empty
- `targetAudiences`: empty
- `coreSellingPoints`: empty
- `keyScenes`: empty
- `currentSuggestion`: empty
- `contentCalendarDraft`: empty

污染检查：

- 不含 `本地服务` / `本地生活`
- 不含 `高意向用户`
- 不含 `到店` / `客流`
- 当前咨询 session 数：0

## 验证结果

通过：

- `cd app && node --test src/server/api/consultation-service.test.ts`
- `git diff --check`
- `cd app && pnpm typecheck`
- `cd app && pnpm lint`
- `cd app && supabase db push --dry-run`
- `cd app && supabase db push --yes`
- `cd app && supabase db push --dry-run`

## Push / merge 状态

- Branch: `main`
- Merge to main: already on main
- Supabase migration push: done
- Git commit: pending
- GitHub / Gitee push: pending

## 下一步建议

1. 提交当前改动到 `main`。
2. 打开商家端，用 `young` 新开一次咨询，确认第一轮回复会先澄清身份和主营业务。
3. 后续把 JTBD、商业模式画布、内容日历、案例提炼拆成独立 consultation skills，不继续把所有能力堆进默认 `agent.md`。
