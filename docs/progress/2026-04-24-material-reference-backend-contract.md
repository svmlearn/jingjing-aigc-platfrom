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

已在 staging Supabase Dashboard SQL Editor 中真实 apply。

- 执行时间：2026-04-24 23:07 CST
- staging project ref：`jrveaabguddromjtibbs`
- 执行文件：`app/supabase/migrations/202604240003_v01_material_workbench_references.sql`
- 执行结果：`Success. No rows returned`
- 备注：Dashboard 对 `drop policy if exists` 弹出 destructive-operation 安全确认，本次确认执行；该语句仅用于幂等重建同名 RLS policy，不删除业务数据。

执行后验证 SQL：

```sql
select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'material_workbench_references'
  ) as table_exists,
  (
    select count(*)::int
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'material_workbench_references'
  ) as index_count,
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'material_workbench_references'
      and policyname = 'material_workbench_refs_owner_read'
  ) as owner_read_policy_count;
```

验证结果：

- `table_exists`: `true`
- `index_count`: `4`
- `owner_read_policy_count`: `1`

## 验证

- `npm run lint`：通过。
- `npm run build`：通过。
