# 2026-04-25 Supabase Migration 当前状态总账

## 目的

本文件用于收敛截至 `2026-04-25` 的 staging Supabase migration 真实状态，避免旧 progress / handoff 里“当时还没执行”的记录误导后续接手。

原则：

- 不删除历史记录。
- 历史文档保留“当时发生了什么”。
- 本文件作为当前 staging Supabase 状态的总账。

## 环境

- Supabase Project：`jingjing-content-platform-staging`
- Project Ref：`jrveaabguddromjtibbs`
- URL：`https://jrveaabguddromjtibbs.supabase.co`
- 复核方式：通过已登录 Supabase Dashboard 浏览器会话调用 Supabase Management API，执行只读验证 SQL。
- 安全说明：未输出、未落盘 Supabase token 或数据库连接密码。

## 当前结论

截至本次复核，仓库当前 `app/supabase/migrations/` 下 7 个 migration 对应的核心表、字段、索引、策略或函数均已在 staging 生效。

| Migration | 当前状态 | 本次只读验证点 |
| --- | --- | --- |
| `202604200001_v01_a_core_import.sql` | 已生效 | `merchant_profiles`、`invitation_codes`、`audience_profiles`、`import_jobs`、`source_items`、`imported_comments`、`content_drafts`、`content_variants`、`asset_objects`、`redeem_invitation_code` |
| `202604220001_v01_platform_admin_foundation.sql` | 已生效 | `merchant_profiles.plan`、`invitation_codes.note`、`platform_settings`、`platform_admin_events`、`idx_platform_admin_events_created_at` |
| `202604230001_v01_staging_cos_video_schema.sql` | 已生效 | `asset_objects.storage_provider`、`asset_objects.bucket_name`、`asset_objects.file_size_bytes`、`video_edit_jobs`、`idx_video_edit_jobs_status_created_at`、`video_edit_jobs_owner_read` |
| `202604240001_v01_cloud_demo_consultation_foundation.sql` | 已生效 | `consultation_sessions`、`consultation_messages`、`consultation_events`、`knowledge_documents`、`knowledge_chunks`、`knowledge_ingestion_jobs`、`platform_settings.consultation_agent`、`platform_settings.knowledge_runtime` |
| `202604240002_v01_ai_runtime_vector_search.sql` | 已生效 | `knowledge_chunks.embedding`、`idx_knowledge_chunks_embedding_hnsw`、`match_knowledge_chunks` |
| `202604240003_v01_material_workbench_references.sql` | 已生效 | `material_workbench_references`、`idx_material_workbench_refs_merchant_created_at`、`material_workbench_refs_owner_read` |
| `202604270001_v22_agent_console_foundation.sql` | 已生效 | `platform_admin_users`、`agent_configs`、`agent_prompt_versions`、`agent_skills`、`agent_skill_bindings`、`knowledge_sets`、`knowledge_set_documents`、`agent_knowledge_set_bindings`、`agent_route_bindings`、`merchant_memberships`、`merchant_credit_accounts`、`merchant_usage_events`、`merchant_credit_ledger`、`agent_test_runs`、`agent_runtime_snapshots` |

## 2026-04-27 V2.2 staging apply 记录

- Branch：`codex/v2.2-admin-auth-rbac`
- 执行文件：`app/supabase/migrations/202604270001_v22_agent_console_foundation.sql`
- 目标环境：`jingjing-content-platform-staging` / `jrveaabguddromjtibbs`
- apply 方式：通过已登录 Supabase Dashboard 浏览器会话调用 Supabase Management API / pg-meta SQL query channel 执行。
- 安全说明：未操作 production，未输出 Supabase token、数据库连接串或 `ADMIN_SETUP_SECRET`。
- 验证结果：关键表全部存在；后台 `super_admin` 初始化、`admin` 登录、disabled 拒绝登录、`admin` 超管接口 403 均通过。
- 测试数据：临时测试管理员账号已清理，staging 保持可用真实邮箱重新初始化首个 `super_admin` 的状态。
- push / merge：本轮未 push，未 merge main。

## 已校正的旧文档

这些文件里原本存在“当时还没跑 migration / worker / smoke”的历史描述，现已在顶部追加状态校正段落：

- `docs/progress/2026-04-23-staging-cos-cam-console-progress.md`
- `docs/progress/2026-04-24-staging-cos-video-worker-gap-check.md`
- `docs/handoff/2026-04-24-staging-cos-video-worker-gap-check-handoff.md`
- `docs/handoff/2026-04-22-platform-admin-foundation-zero-memory-handoff.md`

## 后续规则

之后只要新增 `app/supabase/migrations/*.sql`，同一轮必须补齐：

1. migration 是否已 apply 到 staging。
2. apply 方式：Dashboard SQL Editor、Management API、或 CLI。
3. 验证 SQL。
4. 验证结果。
5. 如果当轮没有 apply，必须明确写“未 apply”，并在后续 apply 后回写状态校正。

## 参考事实来源

- `docs/progress/2026-04-22-v0.6-staging-deployment.md`
- `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap/docs/progress/2026-04-24-staging-video-worker-server-bootstrap-and-smoke.md`
- `docs/progress/2026-04-24-staging-full-deploy-current-target.md`
- `docs/progress/2026-04-24-staging-real-ai-runtime-progress.md`
- `docs/progress/2026-04-24-material-reference-backend-contract.md`
