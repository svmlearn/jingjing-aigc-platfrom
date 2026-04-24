# 2026-04-24 素材引用后端契约补强记录

## 背景

用户指出图文 / 视频工作台前端已经能带入素材，但后端接口与 Supabase 持久化也需要同步补齐，不能只靠前端把素材上下文拼进文本字段。

## 本轮完成

### 后端 API 契约

`/api/content/article-drafts` 与 `/api/content/video-scripts` 新增可选字段：

- `mode`: `create | rewrite`
- `materialId`
- `materialReferenceId`
- `strategyTag`

生成服务会正式解析这些字段，并写入：

- `source_items.trace_payload`
- `content_drafts.input_snapshot`
- `content_drafts.comment_insights`

### 素材引用持久化

新增 migration：

- `app/supabase/migrations/202604240003_v01_material_workbench_references.sql`

新增表：

- `material_workbench_references`

用途：

- 记录素材从素材中心送入图文 / 视频工作台。
- 记录引用状态 `pending / consumed`。
- 生成草稿或脚本后写回 `draft_id / consumed_at`。

### 兼容策略

为了避免 staging 未先执行 migration 导致线上接口失败，代码做了 fallback：

- 如果 `material_workbench_references` 表存在，使用正式表。
- 如果表还不存在，回退到旧的 `source_items.trace_payload.materialWorkbenchReferences` 记录方式。

## Supabase 执行状态

本机当前无法直接执行 `supabase db push`，原因：

- 本机没有 `supabase` CLI 的登录 access token。
- `app/supabase/config.toml` 不存在，项目未 link。
- Vercel 环境变量只有 `NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY`，没有数据库连接串。
- service role key 可以访问数据 API，但不能直接执行 `create table` 这类 DDL。

因此本轮已提交 migration 文件，但还没有真实 apply 到 staging Supabase。

## 下一步执行 Supabase migration 的方式

任选一种：

1. 在 Supabase Dashboard SQL Editor 中执行：
   - `app/supabase/migrations/202604240003_v01_material_workbench_references.sql`
2. 或补齐本地 Supabase CLI 登录与 link 后执行：
   - `npx supabase login`
   - `npx supabase link --project-ref <staging-project-ref>`
   - `npx supabase db push`

## 验证

- `npm run lint`：通过。
- `npm run build`：通过。
