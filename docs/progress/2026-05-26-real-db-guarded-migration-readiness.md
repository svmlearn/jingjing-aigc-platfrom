# 2026-05-26 真实 DB guarded migration readiness

## 状态

- 本轮只做真实服务器 / 真实 RDS 只读检查和 migration dry-run。
- 未修改数据库持久状态。
- 未执行正式 migration。
- 未 push。
- 未部署。

## 当前代码 / 服务器目标

- 本地分支：`main`
- 本地 HEAD：`79b208f merge: integrate gitee 5.23 worker fix`
- 服务器：`8.154.28.41`
- SSH 用户：`ubuntu`
- 当前线上 release：`/srv/jingjing-domestic/releases/20260526115116-79b208f`
- App env：`/srv/jingjing-domestic/shared/env/app.env`

env 文件只确认 key 是否存在，未打印连接串、密码或密钥。

## DB 连接目标

通过服务器当前 release 的 Node / `pg` 依赖读取 root-only app env 后连接 RDS。

查询到的非敏感信息：

```text
database: jingjing_domestic
user: jingjing_app
host: pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com
port: 5432
server_version: 18.3
sslMode: disable
```

## Guarded provider 数据检查

`202605250002_remove_supabase_storage_provider.sql` 和 `202605250003_remove_tencent_cos_provider.sql` 会阻止以下历史数据继续存在：

- `asset_objects.storage_provider = 'supabase_storage'`
- `asset_objects.storage_provider = 'tencent_cos'`
- `knowledge_documents.storage_provider = 'supabase_storage'`
- `knowledge_documents.storage_provider = 'tencent_cos'`

真实 DB 查询结果：

```text
asset_objects:
  aliyun_oss: 160

knowledge_documents:
  aliyun_oss: 3
  inline_seed: 6

blockers:
  asset_objects.supabase_storage: 0
  asset_objects.tencent_cos: 0
  knowledge_documents.supabase_storage: 0
  knowledge_documents.tencent_cos: 0
```

结论：真实 DB 中没有会触发这两个 provider guard 的旧数据。

## 当前 provider constraint 状态

真实 DB 当前 constraint 仍是旧宽松状态：

```text
asset_objects_storage_provider_check:
  storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage')

knowledge_documents_storage_provider_check:
  storage_provider is null
  or storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage', 'inline_seed')
```

这表示 provider cleanup migrations 尚未正式应用到真实 DB。因为旧 provider 数据计数为 0，它们可以通过 guard。

## Merchant media schema 状态

真实 DB 当前不存在：

```text
public.merchant_media_assets
public.merchant_media_clips
```

这不是 `supabase_storage` / `tencent_cos` 数据 guard 问题，但它是当前 `main` 的 schema readiness 问题。

当前代码已有 PostgreSQL merchant-media repository，并且 migration 文件顺序为：

```text
202605250001_merchant_media_tables.sql
202605250004_rename_merchant_media_storage_key_columns.sql
```

由于真实 DB 里 merchant-media 表尚未创建，正式上线前需要先应用 `202605250001_merchant_media_tables.sql`，再应用 `202605250004_rename_merchant_media_storage_key_columns.sql`。后者在旧列存在时 rename 到当前 storage-key 列名。

## 其他当前 HEAD schema 检查

### `content_variants.production_scenes`

真实 DB 已具备：

```text
column: production_scenes jsonb not null default '[]'::jsonb
constraint: content_variants_production_scenes_array
row count in content_variants: 38
```

### `voice_profiles` provider

真实 DB 已具备当前约束和默认值：

```text
voice_profiles_provider_check:
  provider in ('pixelle_clone', 'aliyun_cosyvoice_clone')

voice_profiles.provider default:
  'aliyun_cosyvoice_clone'::text

current provider counts:
  pixelle_clone: 5
```

这说明 `202605250001_selfhost_aliyun_cosyvoice_voice_profiles.sql` 对应的关键状态已经在真实 DB 上存在。

## Migration dry-run

在真实 DB 上执行了一个事务内 dry-run，最后 `rollback`，未保留任何 schema 改动。

Dry-run migration 顺序：

```text
db/migrations/202605220001_content_variant_production_scenes.sql
db/migrations/202605250001_merchant_media_tables.sql
db/migrations/202605250001_selfhost_aliyun_cosyvoice_voice_profiles.sql
db/migrations/202605250002_remove_supabase_storage_provider.sql
db/migrations/202605250003_remove_tencent_cos_provider.sql
db/migrations/202605250004_rename_merchant_media_storage_key_columns.sql
```

结果：

```text
dryRun: passed_then_rolled_back
```

Rollback 后复查：

```text
merchant_media_assets: still missing
merchant_media_clips: still missing
provider constraints: still old wide constraints
```

结论：这批 migrations 在真实 DB 上可以按顺序通过；本轮没有正式应用。

## 结论

关于用户关心的旧 provider guard：

- 没有 `supabase_storage` 数据 blocker。
- 没有 `tencent_cos` 数据 blocker。
- `202605250002` / `202605250003` 的 guard 不会因为旧 provider 数据失败。

但当前真实 DB 仍需要正式应用后续 schema migrations：

1. `202605250001_merchant_media_tables.sql`
2. `202605250002_remove_supabase_storage_provider.sql`
3. `202605250003_remove_tencent_cos_provider.sql`
4. `202605250004_rename_merchant_media_storage_key_columns.sql`

`202605220001_content_variant_production_scenes.sql` 和 `202605250001_selfhost_aliyun_cosyvoice_voice_profiles.sql` 的关键状态已经存在；重复执行也在 dry-run 中通过。

## 建议

不要绕过 migration guard。下一次正式 DB 变更应在维护窗口或明确发布步骤中执行上述 migration 顺序，并在执行后复查：

```sql
select storage_provider, count(*)
from public.asset_objects
group by storage_provider;

select storage_provider, count(*)
from public.knowledge_documents
group by storage_provider;

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('merchant_media_assets', 'merchant_media_clips')
  and column_name in (
    'source_cos_key',
    'source_storage_key',
    'cos_key',
    'storage_key',
    'thumb_cos_key',
    'thumb_storage_key'
  )
order by table_name, column_name;
```

期望最终状态：

- `asset_objects.storage_provider` 只剩 `aliyun_oss`。
- `knowledge_documents.storage_provider` 只剩 `aliyun_oss` / `inline_seed` / `null`。
- merchant-media 表存在。
- merchant-media 当前列名为 `source_storage_key` / `storage_key` / `thumb_storage_key`。
