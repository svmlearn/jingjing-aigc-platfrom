# V2.1 图文工作台提示词模板生成发布记录

日期：2026-04-30

## 发布内容

本次发布包含：

- `f0e2d80 feat: add article prompt generation flow`
- `4cb7e28 docs: add article prompt generation PRD`

核心能力：

- 图文工作台接入代码内置 `create/rewrite/revise` prompt。
- `POST /api/content/article-drafts` 通过现有 OpenAI-compatible runtime 调用 LLM。
- 新增 `POST /api/content/article-drafts/revisions`。
- 生成和修订均写入 `content_drafts / content_variants`。
- `input_snapshot` 记录 `promptMode / promptVersion / llmTrace / riskNotes`。
- 默认 LLM runtime 和 SiliconFlow key 兜底逻辑已记录在：
  - `docs/progress/2026-04-30-siliconflow-runtime-defaults-and-supabase-override.md`

## Gitee

已推送：

```text
gitee main: 193616f -> 4cb7e28
```

远端：

```text
git@gitee.com:jingjing_2025/jingjing-content-platform.git
```

## Vercel

项目：

```text
jingjing-content-platform-staging
```

部署结果：

```text
Production: https://jingjing-content-platform-staging-dw0o6w0c5.vercel.app
Alias: https://jingjing-content-platform-staging.vercel.app
Inspect: https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/ED2wzjRAqwjcfKGLMCDmBKbyiTGH
```

构建结果：

- Vercel build 通过。
- 新增路由 `/api/content/article-drafts/revisions` 已出现在构建路由清单中。

## Supabase

Project ref：

```text
jrveaabguddromjtibbs
```

本次没有新增或修改 Supabase migration 文件。

已执行：

```bash
supabase migration list
```

结果：本地和远端 migration 版本一致，无 pending migration：

```text
202604200001
202604220001
202604230001
202604240001
202604240002
202604240003
202604270001
202604280001
```

因此本轮未执行 `supabase db push`。

## 注意事项

- 真实图文生成依赖运行环境中的 `SILICONFLOW_API_KEY`。
- 如果后续出现图文 fallback，先看 `content_drafts.input_snapshot.llmTrace.mode` 和服务端 `[article-generation] llm fallback` 日志。
