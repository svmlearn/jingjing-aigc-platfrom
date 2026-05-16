# 2026-05-16 自托管 PostgreSQL 全量 Schema Plan

## 1. 文档定位

本方案用于把当前仍依赖 Supabase-only 的 P0 能力迁到 ordinary PostgreSQL：

- 咨询台持久化。
- 商家策略资产。
- 商家知识库 / 平台知识库 / RAG。
- 向量检索。
- 平台管理 Auth。
- Agent 控制台与能力资产。
- 平台设置 / 平台事件。
- 素材工作台引用与导入写路径补齐。

本轮只做 schema plan，不做业务代码迁移，不切正式环境，不合并主线。

## 2. 当前基线

当前 ordinary PostgreSQL baseline 只覆盖第一阶段视频主链路和团队 / 内容日历相关表：

```text
app_users
user_sessions
merchant_profiles
invitation_codes
merchant_team_members
merchant_team_invitation_codes
audience_profiles
import_jobs
source_items
imported_comments
content_drafts
content_variants
asset_objects
video_edit_jobs
merchant_memberships
daily_content_tasks
content_generation_batches
content_generation_jobs
```

已验证 self-hosted 能力：

- owner login/session、团队邀请码、成员加入。
- 内容日历、Dify mock 批量生成、成员任务读取。
- COS 上传登记、视频 job API、worker fast path、normal no-voiceover FireRed、结果预览重签。

仍未 PostgreSQL durable：

- `consultation_*`
- `knowledge_*`
- `agent_*`
- `platform_admin_users` 的自有 Auth 语义
- `platform_settings`
- `platform_admin_events`
- `merchant_strategy_assets`
- `material_workbench_references`
- `vector` extension / `match_knowledge_chunks`

## 3. 总体迁移原则

1. **先补 schema，再补 repository。** 不在业务代码里继续扩大内存 fallback。
2. **P0 只迁能解除 self-hosted durable 阻塞的表。** 会员积分、用量计费、Agent memory notes 可进入 P1。
3. **普通 PostgreSQL 不启用 RLS 作为主权限模型。** API route / repository 必须用当前 session 用户、merchant membership、admin session 做 server-side 权限校验。
4. **平台管理员身份独立于商家身份。** 不把平台 admin 强行塞进 `app_users`，避免商家成员体系和平台后台 RBAC 互相污染。
5. **pgvector 独立成可选迁移。** core schema 不能因为目标 RDS 暂不支持 vector 扩展而整体失败。
6. **新数据不再写 `supabase_storage`。** 历史读取兼容可保留，P0 新写入只允许 `tencent_cos`，后续 OSS adapter 再引入 `aliyun_oss`。
7. **所有跨表写入必须以 transaction 收口。** 特别是咨询消息 + 事件 + 策略资产、知识文档 + chunk + ingestion job、admin 用户 + session。

## 4. P0 表清单

### 4.1 平台管理 Auth

#### `platform_admin_users`

用途：替代 Supabase Auth Admin 管理平台管理员。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `email` | text not null | 小写归一化，唯一 |
| `password_hash` | text not null | 复用 `pbkdf2_sha256$iterations$salt$hash` 格式，或后续升级 argon2 |
| `display_name` | text | 后台显示名 |
| `role` | text not null | `super_admin` / `admin` |
| `status` | text not null | `active` / `disabled` |
| `created_by_admin_id` | uuid FK nullable | 自引用 |
| `last_login_at` | timestamptz | 最近登录 |
| `created_at` / `updated_at` | timestamptz | 审计字段 |

约束与索引：

- PK：`id`
- UNIQUE：`lower(email)`
- FK：`created_by_admin_id -> platform_admin_users(id) on delete set null`
- CHECK：`role in ('super_admin','admin')`
- CHECK：`status in ('active','disabled')`
- INDEX：`(status, created_at desc)`

#### `platform_admin_sessions`

用途：替代 Supabase browser session。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | session row id |
| `admin_user_id` | uuid FK not null | 平台管理员 |
| `token_hash` | text not null | cookie token 的 sha256 |
| `expires_at` | timestamptz not null | 到期时间 |
| `revoked_at` | timestamptz | 手动登出 / 禁用 |
| `created_at` | timestamptz | 创建时间 |

约束与索引：

- UNIQUE：`token_hash`
- INDEX：`(admin_user_id, expires_at desc)`
- INDEX：`(expires_at)` 用于清理过期 session

Bootstrap 规则：

- 首个 super admin 只允许在 `platform_admin_users` 为空且 `ADMIN_SETUP_SECRET` 校验通过时创建。
- 创建 / 修改 / 禁用 admin 必须写 `platform_admin_events`。
- 禁用 admin 时同步 revoke 该 admin 的所有未过期 session。
- 删除 Supabase Auth Admin 依赖后，`platform_admin_users` 不再保留 `auth_user_id`。

### 4.2 咨询台持久化

#### `consultation_sessions`

用途：咨询会话主表，承载商家归属、当前阶段、策略快照冗余。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | 会话 id |
| `merchant_id` | uuid FK not null | 所属商家 |
| `created_by_user_id` | uuid FK nullable | 创建会话的 owner/member |
| `title` | text | 会话标题 |
| `mode` | text not null | `standard` / `roundtable` |
| `status` | text not null | `active` / `completed` / `archived` |
| `current_stage` | text | UI 阶段标签 |
| `strategy_snapshot` | jsonb not null | 当前会话策略快照冗余 |
| `summary_text` | text | 会话摘要 |
| `last_message_at` | timestamptz | 列表排序 |
| `created_at` / `updated_at` | timestamptz | 审计字段 |

约束与索引：

- FK：`merchant_id -> merchant_profiles(id) on delete cascade`
- FK：`created_by_user_id -> app_users(id) on delete set null`
- CHECK：`mode in ('standard','roundtable')`
- CHECK：`status in ('active','completed','archived')`
- INDEX：`(merchant_id, last_message_at desc)`
- INDEX：`(merchant_id, created_by_user_id, last_message_at desc)`

权限语义：

- owner 可访问本 merchant 下全部会话。
- member P0 先只能访问自己创建或 daily task 关联会话；如果当前产品仍只开放 owner 咨询，可先限制为 owner。
- repository 层必须校验 `merchant_team_members`，替代 RLS policy。

#### `consultation_messages`

用途：用户 / assistant / system 消息持久化。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | message id |
| `session_id` | uuid FK not null | 所属会话 |
| `role` | text not null | `assistant` / `user` / `system` |
| `content` | text not null | 消息正文 |
| `stage_label` | text | UI 阶段 |
| `tool_cards` | jsonb not null | 前端工具卡片 |
| `visible_summary` | jsonb not null | 对用户可见摘要 |
| `created_by_user_id` | uuid FK nullable | user message 作者 |
| `created_at` | timestamptz | 创建时间 |

约束与索引：

- FK：`session_id -> consultation_sessions(id) on delete cascade`
- FK：`created_by_user_id -> app_users(id) on delete set null`
- CHECK：`role in ('assistant','user','system')`
- INDEX：`(session_id, created_at asc)`
- INDEX：`(session_id, role, created_at desc)`

#### `consultation_events`

用途：工具调用、runtime、roundtable、失败事件、策略写入事件。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | event id |
| `session_id` | uuid FK not null | 所属会话 |
| `message_id` | uuid FK nullable | 关联消息 |
| `event_type` | text not null | 如 `agent.tool.completed` |
| `stage_label` | text | 阶段 |
| `status` | text | `started` / `completed` / `skipped` / `failed` |
| `payload` | jsonb not null | 事件详情 |
| `created_at` | timestamptz | 创建时间 |

约束与索引：

- INDEX：`(session_id, created_at asc)`
- INDEX：`(session_id, event_type, created_at desc)`
- INDEX：`(message_id)` where not null

事件存储规则：

- `agent.loop.started / completed`：写 runtime 设计、模型、专家、工具摘要。
- `agent.tool.requested / completed`：写工具名、状态、guardrail，不保存完整 system prompt。
- `strategy_snapshot.updated`：写变更字段和 calendar count。
- 失败事件：写 `error_code`、可展示摘要、内部 trace id，不写密钥。

#### `consultation_roundtable_states`

建议 P0 独立表，而不是只放 `consultation_events.payload.state`。

原因：

- 当前 roundtable state 反查最后一条 `roundtable.state.updated` 事件可工作，但列表 / 恢复 / 后续状态迁移成本高。
- 独立表让页面恢复、阶段状态、策略候选审核更稳定；事件仍保留为审计流。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `session_id` | uuid PK/FK | 一会话一状态 |
| `merchant_id` | uuid FK not null | 冗余便于权限 |
| `current_phase` | text not null | `asset` / `skill` / `marketing` / `synthesis` |
| `status` | text not null | `interviewing` / `phase_review` / `synthesis_review` / `completed` |
| `state_payload` | jsonb not null | 当前完整 state |
| `strategy_candidate` | jsonb | 待确认策略候选 |
| `updated_by_user_id` | uuid FK nullable | 最近操作者 |
| `created_at` / `updated_at` | timestamptz | 审计字段 |

索引：

- PK：`session_id`
- INDEX：`(merchant_id, updated_at desc)`

### 4.3 商家策略资产

#### `merchant_strategy_assets`

用途：商家级长期策略资产，供咨询、图文、视频和内容日历复用。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `merchant_id` | uuid PK/FK | 一商家一份当前策略资产 |
| `strategy_snapshot` | jsonb not null | DTO 结构化快照 |
| `strategy_markdown` | text not null | agent.md 上下文友好的 Markdown |
| `canonical_snapshot` | jsonb | 标准化快照 |
| `compiled_context` | jsonb | 编译后的上下文缓存 |
| `source_session_id` | uuid FK nullable | 最近来源会话 |
| `source_message_id` | uuid FK nullable | 最近来源消息 |
| `updated_by_user_id` | uuid FK nullable | 触发用户 |
| `created_at` / `updated_at` | timestamptz | 审计字段 |

索引与约束：

- PK：`merchant_id`
- FK：`merchant_id -> merchant_profiles(id) on delete cascade`
- FK：`source_session_id -> consultation_sessions(id) on delete set null`
- FK：`source_message_id -> consultation_messages(id) on delete set null`
- CHECK：`jsonb_typeof(strategy_snapshot) = 'object'`

同步边界：

- `consultation_sessions.strategy_snapshot` 是会话内冗余，用于恢复当时上下文。
- `merchant_strategy_assets` 是商家级当前资产，只在用户明确沉淀或策略工具完成时更新。
- `daily_content_tasks` 是任务落点，不直接反向覆盖策略资产。
- 内容日历草稿先存在 `strategy_snapshot.contentCalendarDraft`，批量生成时再展开为 `daily_content_tasks` / `content_generation_jobs`。

### 4.4 知识库 / RAG

#### `knowledge_documents`

用途：统一平台方法论文档、商家文件资料、商家手动 memory。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | document id |
| `scope` | text not null | `platform` / `merchant` |
| `merchant_id` | uuid FK nullable | merchant scope 必填 |
| `title` | text not null | 展示名称 |
| `source_name` | text | 文件名或 memory 名称 |
| `document_kind` | text not null | `file` / `memory` / `seed` |
| `content_kind` | text not null | `platform_method` / `merchant_document` / `merchant_memory` |
| `storage_provider` | text | P0 新写入 `tencent_cos` 或 null |
| `bucket_name` | text | 文件型资料 |
| `storage_key` | text | 文件型资料 |
| `mime_type` | text | `text/plain` / `text/markdown` |
| `status` | text not null | `uploaded` / `queued` / `processing` / `indexed` / `failed` / `deleted` |
| `summary_text` | text | 摘要 |
| `metadata` | jsonb not null | 文件大小、sourceText、seedKey 等 |
| `created_by_user_id` | uuid FK nullable | 商家用户 |
| `created_by_admin_id` | uuid FK nullable | 平台 admin |
| `created_at` / `updated_at` | timestamptz | 审计字段 |

约束与索引：

- CHECK：`scope in ('platform','merchant')`
- CHECK：`(scope='platform' and merchant_id is null) or (scope='merchant' and merchant_id is not null)`
- CHECK：`document_kind in ('file','memory','seed')`
- CHECK：`status in ('uploaded','queued','processing','indexed','failed','deleted')`
- INDEX：`(scope, status, created_at desc)`
- INDEX：`(merchant_id, status, updated_at desc)` where merchant_id not null
- INDEX：`(metadata ->> 'seedKey')` unique where seedKey not null, for seed idempotency

统一规则：

- 文件型 document：`document_kind='file'`，正文从 COS 读取或 ingestion 时写入 chunk。
- 文本 memory：`document_kind='memory'`，正文可存在 `metadata.sourceText`，同时写一条或多条 chunks。
- 平台 seed：`document_kind='seed'`，通过 seed SQL / seed script 写入。

#### `knowledge_chunks`

用途：RAG 检索最小单元。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | chunk id |
| `document_id` | uuid FK not null | 所属文档 |
| `chunk_index` | integer not null | 文档内顺序 |
| `content` | text not null | chunk 文本 |
| `token_count` | integer not null | 估算 token |
| `metadata` | jsonb not null | heading、source offsets 等 |
| `embedding_model` | text | 本 chunk 的 embedding 模型 |
| `embedding_dimensions` | integer | 维度 |
| `embedding` | vector(n) nullable | 仅 pgvector migration 成功后存在 |
| `embedding_json` | double precision[] nullable | pgvector 不可用时的低性能兜底，可不建索引 |
| `created_at` | timestamptz | 创建时间 |

约束与索引：

- UNIQUE：`(document_id, chunk_index)`
- INDEX：`(document_id, chunk_index)`
- INDEX：`(created_at desc)`
- CHECK：`chunk_index >= 0`
- CHECK：`token_count >= 0`

向量字段策略：

- core migration 先建 `embedding_json double precision[]`，不依赖扩展。
- pgvector optional migration 再加 `embedding vector(1536)` 和向量索引。
- P0 默认固定 1536 维以兼容现有 `match_knowledge_chunks` 设计；如果最终 embedding provider 不是 1536 维，必须在切换 provider 前调整列维度和索引。

#### `knowledge_ingestion_jobs`

用途：文件 / memory chunking 与 embedding 状态。

关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | job id |
| `document_id` | uuid FK nullable | 处理对象 |
| `merchant_id` | uuid FK nullable | 冗余 |
| `job_type` | text not null | `document_ingestion` / `reindex` / `embedding_refresh` |
| `status` | text not null | `pending` / `queued` / `processing` / `succeeded` / `failed` |
| `attempt_count` | integer not null | 重试次数 |
| `max_attempts` | integer not null | 默认 3 |
| `input_payload` | jsonb not null | chunk policy、file info |
| `log_payload` | jsonb not null | 步骤日志 |
| `error_summary` | text | 失败摘要 |
| `locked_by` / `locked_at` | text / timestamptz | 后续 worker 化预留 |
| `finished_at` | timestamptz | 完成时间 |
| `created_at` / `updated_at` | timestamptz | 审计字段 |

索引：

- INDEX：`(status, created_at asc)`
- INDEX：`(document_id, created_at desc)`
- INDEX：`(merchant_id, status, created_at desc)`

### 4.5 向量检索

#### Optional extension migration

优先路线：

```sql
create extension if not exists vector;
alter table public.knowledge_chunks
  add column if not exists embedding vector(1536);
create index if not exists idx_knowledge_chunks_embedding_hnsw
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
```

索引选择：

- P0 数据量小于 10 万 chunks：可以先无向量索引或 HNSW。
- 推荐 HNSW：召回稳定、无需预先训练，当前 Supabase migration 已使用 HNSW。
- `ivfflat` 后置：需要 lists / analyze / 数据量调参，不适合首轮迁移。

#### `match_knowledge_chunks` 替代

不要在业务层继续调用 Supabase RPC。

推荐两种 ordinary PostgreSQL 实现：

1. repository 内 SQL：

```sql
select
  id,
  document_id,
  chunk_index,
  content,
  token_count,
  metadata,
  created_at,
  1 - (embedding <=> $1::vector) as score
from public.knowledge_chunks
where embedding is not null
  and document_id = any($2::uuid[])
order by embedding <=> $1::vector
limit greatest($3::int, 0);
```

2. 普通 PG function `public.match_knowledge_chunks`：保留函数名但由 app DB 直接调用，不通过 Supabase RPC。

P0 推荐 repository 内 SQL，减少 DB function 迁移和版本管理复杂度。

Fallback：

- 如果目标 PostgreSQL 不支持 `vector` 扩展，P0 先禁用 embedding 写入，只保留 lexical fallback：
  - 文档按 scope / merchant / knowledge set 过滤。
  - 取 eligible chunks 后在 app 层用现有 `scoreText()` 排序。
  - 可选 `tsvector` / `pg_trgm` 进入 P1，但不要让 P0 依赖更多扩展。
- 启动前必须在目标 RDS 上实测：

```sql
select version();
select * from pg_available_extensions where name = 'vector';
create extension if not exists vector;
select extname, extversion from pg_extension where extname = 'vector';
```

### 4.6 Agent 控制台 / 能力资产

P0 最小必迁：

- `agent_configs`
- `agent_prompt_versions`
- `agent_soul_versions`
- `agent_skills`
- `agent_skill_bindings`
- `knowledge_sets`
- `knowledge_set_documents`
- `agent_knowledge_set_bindings`
- `agent_route_bindings`
- `agent_test_runs`
- `agent_runtime_snapshots`

P1 后置：

- `agent_memory_notes`
- `merchant_credit_accounts`
- `merchant_usage_events`
- `merchant_credit_ledger`

#### `agent_configs`

关键字段：

- `id` uuid PK
- `agent_key` text unique
- `display_name` text
- `role_description` text
- `description` text
- `service_status` text：`draft` / `enabled` / `disabled`
- `service_flags` jsonb
- `model_config` jsonb
- `copied_from_agent_id` uuid FK self
- `created_by_admin_id` uuid FK platform_admin_users
- timestamps

索引：

- UNIQUE：`agent_key`
- INDEX：`(service_status, created_at desc)`
- UNIQUE 可选：`lower(display_name)`，如果 UI 要防重名。

#### `agent_prompt_versions`

用途：`agent.md` 版本。

关键字段：

- `id` uuid PK
- `agent_id` uuid FK
- `version_no` integer
- `body` text
- `status` text：`draft` / `active` / `archived`
- `change_note` text
- `created_by_admin_id` uuid FK
- `created_at`, `activated_at`, `archived_at`

索引：

- UNIQUE：`(agent_id, version_no)`
- UNIQUE partial：`(agent_id) where status='active'`
- UNIQUE partial：`(agent_id) where status='draft'`
- INDEX：`(agent_id, created_at desc)`

#### `agent_soul_versions`

用途：`soul.md` 版本，字段与 prompt version 对齐。

P0 需要迁，因为当前 runtime 已注入 soul。

#### `agent_skills` / `agent_skill_bindings`

用途：平台可配置 skill prompt 片段与 agent 挂载关系。

关键索引：

- `agent_skills.skill_key` unique nullable
- `agent_skills.lower(name)` unique
- `agent_skills(status, created_at desc)`
- `agent_skill_bindings(agent_id, skill_id)` unique

#### `knowledge_sets` / bindings

用途：平台 / 商家知识集和 Agent 多对多。

约束：

- `scope='platform'` 时 `merchant_id is null`
- `scope='merchant'` 时 `merchant_id is not null`
- `knowledge_set_documents(knowledge_set_id, document_id)` unique
- `agent_knowledge_set_bindings(agent_id, knowledge_set_id)` unique

依赖关系：

- 必须先迁 `knowledge_documents`，再迁 `knowledge_sets` 与 `knowledge_set_documents`。
- Agent runtime 可在 `knowledge_sets` 为空时工作，但平台知识检索会降级。

#### `agent_route_bindings`

用途：`consultation_default -> agent_id` 唯一默认入口。

约束：

- UNIQUE：`route_key`
- CHECK：`route_key in ('consultation_default')`
- CHECK：`status in ('active','disabled')`
- repository 设置默认 Agent 前必须校验目标 agent `service_status='enabled'` 且存在 active prompt。

#### `agent_test_runs`

用途：后台测试台记录。

P0 可以迁表，测试台 repository 可跟随 Agent 控制台迁移。

#### `agent_runtime_snapshots`

用途：真实咨询运行快照，关联咨询 message/session。

关键字段：

- `session_id` FK `consultation_sessions`
- `message_id` FK `consultation_messages`
- `agent_id`, `prompt_version_id`
- `candidate_skill_ids`, `actual_skill_ids`
- `knowledge_set_ids`, `knowledge_match_ids`, `memory_match_ids`
- `tool_call_summary`
- `model`
- `created_at`

### 4.7 平台设置 / 事件

#### `platform_settings`

用途：平台级 runtime 配置。

关键字段：

- `key` text PK
- `category` text not null
- `value` jsonb not null default `{}`
- `description` text
- timestamps

category：

```text
llm
import
membership
consultation
script_production
knowledge
```

必备 seed keys：

- `llm_runtime`
- `import_runtime`
- `membership_plans`
- `consultation_agent`
- `script_production_agent`
- `knowledge_runtime`

#### `platform_admin_events`

用途：平台后台审计。

关键字段：

- `id` uuid PK
- `actor_admin_id` uuid FK nullable
- `actor_label` text not null
- `event_type` text not null
- `target_type` text not null
- `target_id` text
- `summary` text not null
- `details` jsonb not null
- `created_at` timestamptz

索引：

- `(created_at desc)`
- `(actor_admin_id, created_at desc)`
- `(target_type, target_id, created_at desc)`

### 4.8 素材 / 导入写路径

#### `material_workbench_references`

用途：素材中心送入图文 / 视频工作台的待消费引用。

关键字段：

- `id` uuid PK
- `merchant_id` uuid FK
- `material_item_id` uuid FK `source_items`
- `target_workbench` text：`article` / `video`
- `status` text：`pending` / `consumed`
- `created_by_user_id` uuid FK `app_users`
- `draft_id` uuid FK nullable
- `trace_payload` jsonb
- `created_at`, `consumed_at`

索引：

- `(merchant_id, created_at desc)`
- `(material_item_id, status, created_at desc)`
- `(draft_id)` where not null

历史 / 素材边界：

- `source_items` 继续表示从导入、采集或手动录入得到的素材线索，是素材历史库的主事实。
- `imported_comments` 继续表示某条 `source_items` 下的评论事实，不承载工作台状态。
- `material_workbench_references` 只表示“这条素材被送去哪个工作台、是否已消费”，不复制素材正文，不替代 `source_items`。
- 图文 / 视频草稿生成后，工作台产物写 `content_drafts` / `content_variants` / `video_edit_jobs`，只通过 `draft_id` 或 trace payload 回链引用来源素材。
- 历史兼容读取可以继续识别旧 Supabase 数据，但 self-hosted 新写入必须落 ordinary PostgreSQL。

#### `import_jobs` / `source_items` / `imported_comments`

这些表已在 baseline，但 repository 写路径未全量迁移。

P0 schema 不新增这三张表，但必须把写路径迁移列入 self-hosted 阶段，否则素材历史仍会在 Supabase-only 环境断裂。repository 需要补齐：

- `createImportJob`
- `getImportJobById`
- `listImportJobs`
- `countRunningImportJobs`
- `updateImportJob`
- `upsertSourceItems`
- `ensureSourceItemForComments`
- `upsertImportedComments`

P0 schema 层只需要确认 baseline 字段足够；如果要支持素材中心上传手动素材，`source_items.source_type` 可保留 `manual_text`，文件/视频素材仍落 `asset_objects`。

## 5. Supabase-only 语义替代

| Supabase 语义 | 替代方案 |
| --- | --- |
| `auth.users` | 商家端用 `app_users`；平台后台用独立 `platform_admin_users`。所有 FK 改到这两类表。 |
| Supabase Auth session | 商家端保留 `user_sessions`；平台端新增 `platform_admin_sessions`。 |
| `auth.uid()` | API route 解析当前 session user/admin 后传入 repository；repository 用 `merchant_id + user_id/admin_id` 显式过滤。 |
| RLS policy | 不启用 RLS 作为主安全边界；用 server-side RBAC 和 membership 检查。 |
| `createSupabaseAdminClient()` | 分 domain 替换为 `queryAppDb` / `withAppDbTransaction` repository。 |
| Supabase RPC `redeem_invitation_code` | 已有 PG path，正式注册 API 还要接入 app-owned user create transaction。 |
| Supabase RPC `match_knowledge_chunks` | repository SQL 或普通 PG function；不再通过 Supabase RPC client。 |
| `supabase_storage` | P0 新数据禁写。历史兼容读取保留到数据迁移完成。 |
| Supabase Realtime / Storage | 当前主链路未依赖 realtime；文件存储继续走 COS，后续 OSS adapter 独立设计。 |

## 6. Migration 顺序

建议拆成多个 ordinary PostgreSQL migration，避免 pgvector 或 Agent seed 失败影响 core schema：

1. `20260516_p0_admin_auth.sql`
   - `platform_admin_users`
   - `platform_admin_sessions`
   - `platform_admin_events`
2. `20260516_p0_platform_settings.sql`
   - `platform_settings`
   - seed `llm_runtime/import_runtime/membership_plans/consultation_agent/script_production_agent/knowledge_runtime`
3. `20260516_p0_consultation.sql`
   - `consultation_sessions`
   - `consultation_messages`
   - `consultation_events`
   - `consultation_roundtable_states`
4. `20260516_p0_strategy_assets.sql`
   - `merchant_strategy_assets`
   - 从最新 `consultation_sessions.strategy_snapshot` 回填一次
5. `20260516_p0_knowledge_core.sql`
   - `knowledge_documents`
   - `knowledge_chunks` with `embedding_json`
   - `knowledge_ingestion_jobs`
6. `20260516_p0_agent_core.sql`
   - `agent_configs`
   - `agent_prompt_versions`
   - `agent_soul_versions`
   - `agent_skills`
   - `agent_skill_bindings`
   - `knowledge_sets`
   - `knowledge_set_documents`
   - `agent_knowledge_set_bindings`
   - `agent_route_bindings`
   - `agent_test_runs`
   - `agent_runtime_snapshots`
7. `20260516_p0_pgvector_optional.sql`
   - `create extension vector`
   - `knowledge_chunks.embedding vector(1536)`
   - HNSW index
8. `20260516_p0_material_import_boundaries.sql`
   - `material_workbench_references`
   - import/source/comment small constraint/index 补齐，如有需要
   - 不复制历史素材表，只补工作台引用和必要幂等约束

每个 migration 必须：

- 不引用 `auth.users`。
- 不创建 RLS policy。
- 使用 `timezone('utc', now())` 和既有 `set_updated_at()`。
- 可在空库重复执行。
- seed 使用 `on conflict do nothing` 或幂等 upsert。

## 7. Seed / fixture 方案

### 7.1 最小 admin seed

不要在 SQL 中明文写密码。使用脚本生成 hash：

```bash
node app/scripts/create-domestic-password-hash.mjs '<temporary-admin-password>'
```

再通过 seed SQL 插入：

- `platform_admin_users.email`
- `password_hash`
- `role='super_admin'`
- `status='active'`

### 7.2 Agent foundation seed

最小必须有：

- `agent_configs.agent_key='initial_consultation_agent'`
- active `agent_prompt_versions`，来自当前默认 consultation agent prompt。
- active `agent_soul_versions`，如果没有旧值则用空 body 或安全默认语气。
- `knowledge_sets.set_key='base_platform_knowledge'`
- `agent_knowledge_set_bindings` 绑定初始 Agent 和基础知识集。
- `agent_route_bindings.route_key='consultation_default'` 指向初始 enabled Agent。

### 7.3 Knowledge seed

平台方法论文档用 seed script 写入：

- `knowledge_documents(scope='platform', document_kind='seed')`
- `knowledge_chunks`
- `knowledge_set_documents`

商家 memory fixture：

- `knowledge_documents(scope='merchant', document_kind='memory', content_kind='merchant_memory')`
- 一条 chunk。
- 一个 ingestion job `succeeded`。

### 7.4 Consultation fixture

用于 smoke：

- 创建一条 `consultation_sessions`。
- 插入 user message / assistant message。
- 插入 `agent.loop.started`、`agent.tool.completed`、`strategy_snapshot.updated`。
- 更新 `merchant_strategy_assets`。

## 8. Repository 迁移顺序

### P0 第一批

1. `platform-admin-session.ts`
   - 新增 app-owned admin session。
   - bootstrap super admin。
   - login/logout/current admin。
2. `consultation-repository.ts`
   - `list/create/get/update/delete session`
   - `create/list messages`
   - `create/list events`
   - roundtable state table 读写。
3. `merchant-strategy-asset-repository.ts`
   - get/upsert/ensure 全部走 PG。
   - 与 consultation update 放入 transaction。
4. `knowledge-repository.ts`
   - documents CRUD。
   - ingestion jobs。
   - replace/list chunks。
   - search：先 lexical fallback，再 pgvector SQL。
5. `agent-console-repository.ts`
   - 先迁 read path：foundation state、list/get agents、active prompt/soul、skills、knowledge sets、route binding。
   - 再迁 write path：prompt draft/publish/rollback、skill、knowledge set、bindings、test run、runtime snapshot。

### P1 第二批

1. `platform-admin-repository.ts`
   - admin users create/update/disable 改为自有 Auth。
   - platform settings / events。
   - merchant/invitation 管理视图。
2. `material-library-repository.ts`
   - material list/create/upsert。
   - workbench references。
3. `import-repository.ts`
   - import job 和 source/comment upsert 写路径。
4. `register-with-invite/route.ts`
   - merchant owner 注册完全迁到 `app_users + user_sessions + redeem invitation transaction`。

## 9. Self-hosted smoke 验证清单

### 9.1 Schema 验证

```bash
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_admin_auth.sql
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_platform_settings.sql
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_consultation.sql
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_strategy_assets.sql
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_knowledge_core.sql
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_agent_core.sql
psql "$DATABASE_URL" -f app/db/migrations/20260516_p0_pgvector_optional.sql
```

必查 SQL：

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'platform_admin_users',
    'platform_admin_sessions',
    'consultation_sessions',
    'consultation_messages',
    'consultation_events',
    'consultation_roundtable_states',
    'merchant_strategy_assets',
    'knowledge_documents',
    'knowledge_chunks',
    'knowledge_ingestion_jobs',
    'agent_configs',
    'agent_prompt_versions',
    'agent_soul_versions',
    'agent_route_bindings',
    'platform_settings'
  )
order by tablename;
```

pgvector 检查：

```sql
select * from pg_available_extensions where name = 'vector';
select extname, extversion from pg_extension where extname = 'vector';
select column_name, udt_name
from information_schema.columns
where table_name = 'knowledge_chunks'
  and column_name in ('embedding', 'embedding_json');
```

### 9.2 App smoke

建议新增脚本或扩展现有 smoke：

```bash
node app/scripts/check-domestic-app-env.mjs --env-file app/.env.production
```

新增 P0 smoke 脚本建议：

```bash
node app/scripts/check-selfhost-p0-postgres-smoke.mjs --base-url http://127.0.0.1:3002
```

覆盖：

- platform admin bootstrap。
- platform admin login/logout/current。
- consultation create/message/event/list/get。
- merchant strategy asset upsert/get。
- merchant memory create/list/chunk/search lexical。
- agent foundation state：enabled agent + active prompt/soul + default route。
- platform settings read/update。

### 9.3 API 手动 smoke

```bash
curl -i "$BASE_URL/api/health"
curl -i -X POST "$BASE_URL/platform-admin-login" ...
curl -i "$BASE_URL/api/platform-admin/agents"
curl -i "$BASE_URL/api/consultation/sessions"
curl -i -X POST "$BASE_URL/api/consultation/sessions" ...
curl -i -X POST "$BASE_URL/api/consultation/sessions/<id>/messages" ...
curl -i "$BASE_URL/api/merchant-knowledge/documents"
```

验收标准：

- 关闭 Supabase env 后仍可登录平台管理端。
- 关闭 Supabase env 后咨询会话刷新仍存在。
- 关闭 Supabase env 后商家 memory 列表刷新仍存在。
- `GET /api/platform-admin/agents` 不再只返回 demo fallback。
- vector 不可用时，知识检索走 lexical fallback 且返回可解释降级状态。

## 10. 阿里云 RDS PostgreSQL 兼容风险

必须先确认目标实例是否支持 pgvector。

原因：

- 当前 self-hosted 新加坡 PostgreSQL 只有 `pgcrypto` / `plpgsql`，没有 `vector`。
- 阿里云 RDS PostgreSQL 的扩展可用性与实例版本、系列、参数组有关，不能靠代码假设。
- `create extension vector` 如果失败，不能让 P0 core schema 全部失败。

确认方式：

```sql
select version();
select name, default_version, installed_version
from pg_available_extensions
where name in ('vector', 'pg_trgm');
create extension if not exists vector;
```

决策：

- 如果支持：启用 `embedding vector(1536)` + HNSW，repository 走向量 SQL。
- 如果不支持：P0 先保留 `embedding_json` + lexical fallback；评估自建 PostgreSQL 或外部向量库。
- 如果 embedding provider 不是 1536 维：在迁移前重新定维度，避免同一列混多维。

## 11. 不做项和后置项

本轮不做：

- 不写业务代码大改。
- 不创建真实 migration SQL。
- 不修改远端新加坡服务。
- 不实现 Aliyun OSS adapter。
- 不声称咨询 / 知识库 / Agent 已完成迁移。
- 不合并主线。

后置项：

- Aliyun OSS provider adapter。
- Agent memory notes / `memory.md` 长期记忆。
- 会员积分完整扣费和流水。
- TTS/voiceover provider 修复。
- 真实浏览器 / 手机端完整 e2e。
- Supabase 历史数据导出、转换、导入与校验。

## 12. 下一轮推荐代码范围

建议第一批代码迁移只做：

```text
1. platform_admin_users / platform_admin_sessions
2. consultation_sessions / consultation_messages / consultation_events / consultation_roundtable_states
3. merchant_strategy_assets
4. knowledge_documents / knowledge_chunks / knowledge_ingestion_jobs
5. pgvector optional migration + searchKnowledgeChunks replacement
```

不要同时迁素材、导入、积分、OSS。第一批目标是解除 self-hosted 环境下咨询、知识库、Agent 默认入口无法 durable 的阻塞。
