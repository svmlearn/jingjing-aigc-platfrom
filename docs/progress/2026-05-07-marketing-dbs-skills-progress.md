# 2026-05-07 营销专家 DBS skill 入库进展

## 目标

为平台内「营销专家」Agent 创建 DBS 对应 skill，并把 reference 放入知识库。

用户要求：

- Skill Body 使用原始 `SKILL.md` 完整内容。
- reference 同样放入知识库。
- 不下载外部项目。

## 分支与工作区

- Branch: `codex/marketing-dbs-skills`
- Worktree: `/Users/wy/.codex/worktrees/marketing-dbs-skills`
- Base: `origin/main` at `a5a9da6`

## 输入来源

本轮只读取本地 DBS skill 源文件：

- `dbs-content/SKILL.md`
- `dbs-content/references/content_内容创作方法论.md`
- `dbs-content/references/content_平台特性与案例.md`
- `dbs-hook/SKILL.md`
- `dbs-xhs-title/SKILL.md`
- `dbs-ai-check/SKILL.md`

## 已完成

新增 Supabase migration：

- `app/supabase/migrations/202605070002_marketing_dbs_skills.sql`

迁移内容：

- 创建或复用「营销专家」Agent。
- 创建知识包 `dbs_marketing_content_knowledge`。
- 写入两份 reference 知识文档：
  - `content_内容创作方法论`
  - `content_平台特性与案例`
- 将 reference 拆成 `knowledge_chunks`：
  - `content_内容创作方法论`: 9 chunks
  - `content_平台特性与案例`: 5 chunks
- 创建或更新四个 enabled skill：
  - `dbs_content` / `DBS 内容创作诊断`
  - `dbs_hook` / `DBS 短视频开头优化`
  - `dbs_xhs_title` / `DBS 小红书标题公式工具`
  - `dbs_ai_check` / `DBS AI 写作特征识别`
- 将四个 skill 绑定给 display_name 为「营销专家」的 Agent。
- 将 `dbs_marketing_content_knowledge` 绑定给「营销专家」。

## 验证

已完成：

- `git diff --check`: pass
- `supabase link --project-ref jrveaabguddromjtibbs`: pass
- `supabase db push --dry-run`: only `202605070002_marketing_dbs_skills.sql` pending
- `supabase db push`: migration applied to staging Supabase
- 远端查询确认四个 skill 均为 `enabled`，body 字符数分别为：
  - `dbs_ai_check`: 5126
  - `dbs_content`: 4641
  - `dbs_hook`: 4796
  - `dbs_xhs_title`: 13716
- 远端串行复查确认：
  - `skill_count`: 4
  - `skill_binding_count`: 4
  - `knowledge_binding_count`: 1
  - `content_内容创作方法论`: 9 chunks
  - `content_平台特性与案例`: 5 chunks

## 注意

并行执行 Supabase linked query 时触发过临时登录限流；后续查库应优先合并成单条 SQL 串行执行。
