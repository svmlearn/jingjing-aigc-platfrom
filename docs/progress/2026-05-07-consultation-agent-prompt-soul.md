# 2026-05-07 咨询 Agent agent.md / soul.md 补强进展

## 目标

排查 `young` 新账号被咨询 Agent 默认识别为“本地服务 / 本地生活服务”的原因后，继续补强默认咨询 Agent 的 `agent.md` 和 `soul.md`，让它更像战略咨询顾问，而不是旧的本地生活模板。

## GitHub 检索

使用项目外部 skill `github-repo-search` 的流程完成需求对齐和检索。

已沉淀报告：

- `docs/探索/2026-05-07-consultation-agent-prompt-github-research.md`

主要参考方向：

- `LichAmnesia/GPT-Prompt-Hub`
- `Troyanovsky/AI-Professional-Prompts`
- `deanpeters/product-manager-prompts`
- `deanpeters/Product-Manager-Skills`
- `phuryn/pm-skills`
- `nidhinjs/prompt-master`
- `alirezarezvani/claude-skills`
- `dair-ai/Prompt-Engineering-Guide`
- `msitarzewski/agency-agents`
- `x1xhlol/system-prompts-and-models-of-ai-tools`

结论：不复制外部 prompt 正文，只抽象为静境自己的 `agent.md` / `soul.md` 资产结构。

## 已完成改动

新增迁移：

- `app/supabase/migrations/202605070004_consultation_agent_prompt_soul.sql`
- `app/supabase/migrations/202605070005_consultation_agent_prompt_debias_terms.sql`

迁移内容：

- 更新 `platform_settings.consultation_agent.systemPrompt` 为中性战略咨询 fallback。
- 将 `initial_consultation_agent` 的 `role_description` 改为 `商家战略内容咨询顾问`。
- 归档旧 active `agent_prompt_versions`，先新增 active `agent.md v2`，再用 `agent.md v3` 移除旧模板具体词。
- 为 `initial_consultation_agent` 先新增 active `soul.md v1`，再用 `soul.md v2` 移除旧模板具体词。
- 在 `agent.md` 与 `soul.md` 中明确写入空资料 guardrail：
  - 不从商家名称、邮箱、账号名、空白资料或旧默认配置推断行业。
  - 不默认任何具体赛道、经营场景、获客方式、转化方式或用户类型。
  - 写入策略资产前区分“已确认事实 / 合理假设 / 待验证问题”。
  - 一轮只问一个关键问题。
  - active `agent.md v3` / `soul.md v2` 不再包含旧污染词：`本地生活服务`、`高意向用户`、`到店`、`客流`。

新增测试：

- `app/src/server/api/consultation-service.test.ts`
  - 新增 `initial consultation agent prompt and soul keep empty profile facts unknown`。
  - 校验新迁移同时包含 `agent_prompt_versions` 与 `agent_soul_versions`。
  - 校验空资料防污染语句存在。
  - 防止重新出现旧默认文案。

## 远端 Supabase 状态

执行：

- `supabase db push --dry-run`
  - 发现远端还未记录上一轮 `202605070003_consultation_empty_profile_guardrails.sql`。
  - 待推迁移为 `202605070003` 和 `202605070004`。
- `supabase db push --yes`
  - 已应用 `202605070003_consultation_empty_profile_guardrails.sql`。
  - 已应用 `202605070004_consultation_agent_prompt_soul.sql`。
  - 已应用 `202605070005_consultation_agent_prompt_debias_terms.sql`。
- 再次 `supabase db push --dry-run`
  - 返回 `Remote database is up to date.`

远端复查：

- `initial_consultation_agent`
  - `roleDescription`: `商家战略内容咨询顾问`
  - active `agent.md`: version 3
  - active `soul.md`: version 2
  - prompt versions: v3 active, v2 archived, v1 archived
  - soul versions: v2 active, v1 archived
  - active prompt / soul term check:
    - `本地生活服务`: false
    - `高意向用户`: false
    - `到店`: false
    - `客流`: false

`ywangyangw1@163.com` / `young` 复查：

- merchant profile:
  - `name`: `young`
  - `industry`: `null`
  - `service_items`: `[]`
  - `default_cta`: `[]`
  - `region_summary`: `null`
  - `brand_summary`: `null`
- `consultation_sessions`: 0
- `merchant_strategy_assets.strategy_snapshot`:
  - `positioning`: `""`
  - `targetAudiences`: `[]`
  - `coreSellingPoints`: `[]`
  - `keyScenes`: `[]`
  - `currentSuggestion`: `""`
  - `contentCalendarDraft`: `[]`
- 污染检查：
  - 不包含 `本地服务` / `本地生活`
  - 不包含 `高意向用户`
  - 不包含 `到店` / `客流`

## 验证

已通过：

- `cd app && node --test src/server/api/consultation-service.test.ts`
- `git diff --check`
- `cd app && pnpm typecheck`
- `cd app && pnpm lint`
- `cd app && supabase db push --dry-run`
- `cd app && supabase db push --yes`
- `cd app && supabase db push --dry-run`

## 注意

- `202605070003` 在上一轮已经通过直接数据修复清理了 `young` 的污染，但迁移历史未推送；本轮 DB push 已把它补进远端迁移历史。
- 当前 `young` 已保持空资料状态，后续新咨询应先追问“你是谁 / 主营什么 / 现在最想解决什么”，不应再出现默认本地生活定位。
