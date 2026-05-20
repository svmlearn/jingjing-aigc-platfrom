# 2026-05-16 Full Supabase / Vercel Exit Audit

## 1. 本轮边界

本轮只完成两件事：

1. 将 `codex/domestic-infra-migration` push 到 Gitee 远端同名分支备份。
2. 完成全量 Supabase / Vercel 退出审计，梳理咨询、RAG、知识库、Agent 控制台、平台管理 Auth、向量检索、素材导入历史等模块的迁移范围。

本轮未做：

- 未 merge `main`。
- 未做大面积代码迁移。
- 未写 Phase1 e2e pass marker。
- 未标记 long-task complete。
- 未切换 `ba-ba-ke.com`。
- 未声明 Aliyun OSS 已验证。

## 2. Gitee 备份结果

执行目录：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

执行命令：

```bash
git push -u gitee codex/domestic-infra-migration
```

结果：

```text
To gitee.com:jingjing_2025/jingjing-content-platform.git
 * [new branch]      codex/domestic-infra-migration -> codex/domestic-infra-migration
branch 'codex/domestic-infra-migration' set up to track 'gitee/codex/domestic-infra-migration'.
```

当前本地分支：

```text
codex/domestic-infra-migration...gitee/codex/domestic-infra-migration
```

## 3. 审计命令

主要执行命令：

```bash
rg -n "supabase|Supabase|createSupabase|isSupabase|auth\.admin|match_knowledge_chunks|storage_provider|supabase_storage" app/src app/scripts app/supabase workers/video-worker
rg --files-with-matches "supabase|Supabase|createSupabase|isSupabase|auth\.admin|match_knowledge_chunks|storage_provider|supabase_storage" app/src app/scripts app/supabase workers/video-worker
rg -n "^create table|^alter table|^create or replace function|^create extension|enable row level security|auth\.users|vector|match_knowledge_chunks|policy|grant" app/supabase/migrations
rg -n "^create table" app/db/migrations/202605130001_domestic_core_baseline.sql
rg -n "vercel|Vercel|VERCEL|\.vercel\.app|NEXT_PUBLIC_SUPABASE|SUPABASE|supabase" app/src app/scripts app/vercel.json app/next.config.ts workers/video-worker deploy
```

本轮只读代码与文档，未输出密钥。

## 4. 当前 PostgreSQL baseline 覆盖范围

普通 PostgreSQL baseline 当前只覆盖第一阶段主链路：

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

这些表来自：

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
```

结论：

- 商家 owner 登录、团队、内容日历、内容生成批次、图文/视频草稿、媒体资产、视频任务、worker 主链路已有 ordinary PostgreSQL 第一阶段路径。
- 咨询、知识库 / RAG、Agent 控制台、平台管理 Auth、平台设置、平台事件、素材工作台引用、商家策略资产仍未进入 ordinary PostgreSQL baseline。

## 5. 模块迁移矩阵

| 模块 | 当前文件 | 当前依赖 | 是否已有 PostgreSQL path | 迁移优先级 | 阻塞点 |
| --- | --- | --- | --- | --- | --- |
| 咨询台会话 / 消息 / 事件 | `app/src/lib/db/consultation-repository.ts`, `app/src/server/api/consultation-service.ts`, `app/src/server/api/roundtable-consultation-service.ts` | Supabase admin client；无配置时退回内存 Map | 否 | P0 | `consultation_sessions/messages/events` 不在 `app/db` baseline；roundtable state 目前编码在 `consultation_events.payload.state`，无独立 `consultation_roundtable_states`；需要普通 PG repository 和事务写入 |
| 策略资产 / 内容日历快照 | `app/src/lib/db/merchant-strategy-asset-repository.ts`, `app/src/lib/db/daily-content-task-repository.ts` | `merchant_strategy_assets` 仍走 Supabase；`daily_content_tasks` 已有 PG path | 部分 | P0 | `merchant_strategy_assets` 未进 baseline；咨询策略快照和日历草稿要从 Supabase upsert 迁到 PG；需要明确咨询快照、商家策略资产、每日任务三者同步边界 |
| 知识库文档 / chunks / ingestion job | `app/src/lib/db/knowledge-repository.ts`, `app/src/server/api/knowledge-service.ts`, `app/src/components/merchant/merchant-knowledge-library.tsx`, `app/src/components/platform-admin/platform-knowledge-manager.tsx` | Supabase admin client；无配置时退回内存 Map | 否 | P0 | `knowledge_documents/chunks/ingestion_jobs` 不在 baseline；`created_by_user_id` 仍引用 Supabase Auth 用户语义；文本记忆仍写 `storageProvider: "supabase_storage"` |
| RAG / 向量检索 | `app/src/lib/db/knowledge-repository.ts`, `app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql` | Supabase RPC `match_knowledge_chunks`；Supabase `vector` extension | 否 | P0 | 需要确认自托管 PostgreSQL / 阿里云 RDS 是否支持 `pgvector`；要把 `supabase.rpc("match_knowledge_chunks")` 改为 SQL repository；要决定 embedding 类型、索引和 fallback 检索策略 |
| Agent 控制台 | `app/src/lib/db/agent-console-repository.ts`, `app/src/app/api/platform-admin/agents/*`, `app/src/components/platform-admin/agent-console-pages.tsx` | Supabase admin client；部分 demo fallback | 否 | P0/P1 | `agent_configs`, `agent_prompt_versions`, `agent_soul_versions`, `agent_skills`, `agent_skill_bindings`, `knowledge_sets`, `knowledge_set_documents`, `agent_knowledge_set_bindings`, `agent_route_bindings`, `agent_test_runs`, `agent_runtime_snapshots`, `merchant_credit_*`, `merchant_usage_events` 未进 baseline；依赖平台 admin 身份和知识库表先落地 |
| 平台管理 Auth | `app/src/lib/auth/platform-admin-session.ts`, `app/src/lib/db/platform-admin-repository.ts`, `app/src/app/platform-admin-login/*` | Supabase Auth public client；Supabase `auth.admin.createUser/updateUserById/deleteUser`；`platform_admin_users.auth_user_id references auth.users` | 否 | P0 | 需要引入 app-owned admin session；建议独立 `platform_admin_users/platform_admin_sessions`，避免干扰商家 `app_users`；需要密码 hash、session cookie、bootstrap 超管、admin 用户管理替代 Supabase Auth |
| 平台设置 / 平台事件 | `app/src/lib/db/platform-admin-repository.ts`, `app/supabase/migrations/202604220001_v01_platform_admin_foundation.sql` | Supabase `platform_settings`, `platform_admin_events` | 否 | P1 | `platform_settings` 是 LLM/import/membership/consultation/script/knowledge runtime 的控制面，必须进入 PG 后 Agent/知识库迁移才完整；事件表要决定 retention |
| 导入任务写路径 | `app/src/lib/db/import-repository.ts`, `app/src/server/import-jobs/service.ts` | create/update/upsert 仍走 Supabase；只读 `listSourceItems/getSourceItem/listImportedComments` 在 `isPostgresVideoChainEnabled()` 下有 PG path | 部分 | P1 | baseline 已有 `import_jobs/source_items/imported_comments`，但 create job、run update、upsert source items、upsert comments 未迁 PG；当前不能称为导入链路 durable PostgreSQL |
| 素材中心 / 素材工作台引用 | `app/src/lib/db/material-library-repository.ts`, `app/src/app/api/materials/*` | Supabase `source_items/material_workbench_references`；无配置时内存 Map | 部分 | P1 | `source_items` 在 baseline，但 `material_workbench_references` 未进 baseline；素材中心的 provider cache / send-to-workbench / consumed trace 仍需 PG repository |
| 图文 / 视频草稿 / 媒体资产 / 视频任务 | `app/src/lib/db/content-draft-repository.ts`, `app/src/lib/db/media-repository.ts`, `app/src/lib/db/video-edit-job-repository.ts`, `app/src/lib/db/postgres-video-chain-repository.ts` | 已有 PG path；仍保留 Supabase fallback 和 `supabase_storage` 兼容类型 | 是，第一阶段已覆盖 | P2 清理 | 保持不回退；后续切正式生产前再移除 Supabase fallback、补历史数据迁移和约束升级 |
| 商家 / 团队 / 邀请码 | `app/src/lib/db/merchant-repository.ts`, `app/src/lib/auth/domestic-session.ts`, `app/src/app/api/auth/register-with-invite/route.ts` | 登录已有 app-owned session；注册邀请 API 仍用 Supabase admin create user；repository 仍保留 Supabase fallback | 部分 | P1 | 当前第一阶段靠 seed owner 登录跑通；正式注册 / 邀请码兑换要补 app-owned 用户创建与事务回滚，替代 `auth.admin.createUser` |
| Worker DB / COS | `workers/video-worker/worker/app/config.py`, `workers/video-worker/worker/app/db.py`, `workers/video-worker/worker/app/processor.py` | `WORKER_DATABASE_URL` 优先，`SUPABASE_DB_URL` 兼容 fallback；只接受 `tencent_cos` input asset | 是，视频链路已覆盖 | P2 清理 | 保持第一阶段稳定；后续移除 `SUPABASE_DB_URL` 文案前需确认部署环境全部切换 |
| Vercel 退出 | `app/vercel.json`, `app/src/proxy.ts`, `deploy/domestic/*` | `vercel.json` 存在；proxy 内有 staging `.vercel.app` canonical redirect；国内 deploy 模板已存在 | 部分 | P1/P2 | 自托管运行已有模板，但正式退出 Vercel 前要移除/隔离 Vercel host redirect、更新健康检查和部署 runbook；不能误把 Vercel staging 逻辑带到国内生产 |
| 存储 provider / OSS | `app/src/contracts/media.ts`, `app/src/contracts/knowledge.ts`, `app/src/server/api/schemas.ts`, `workers/video-worker/worker/app/models.py` | 类型和 worker 当前只认 `tencent_cos` / `supabase_storage`，worker input 强制 `tencent_cos` | 否 | P2 | 需要新增 `aliyun_oss` provider adapter；数据库 check、DTO schema、签名上传、预览签名、worker download/upload 都要同时扩展；不要复用 `COS_*` 作为 OSS env |

## 6. Supabase-only schema 清单

当前仍只存在于 `app/supabase/migrations`，尚未进入普通 PostgreSQL baseline 的关键表：

```text
consultation_sessions
consultation_messages
consultation_events
knowledge_documents
knowledge_chunks
knowledge_ingestion_jobs
merchant_strategy_assets
platform_settings
platform_admin_events
platform_admin_users
agent_configs
agent_prompt_versions
agent_soul_versions
agent_skills
agent_skill_bindings
knowledge_sets
knowledge_set_documents
agent_knowledge_set_bindings
agent_route_bindings
agent_test_runs
agent_runtime_snapshots
merchant_credit_accounts
merchant_usage_events
merchant_credit_ledger
material_workbench_references
```

需要替换或删除的 Supabase-only 语义：

- `auth.users` 外键：迁到 `app_users` 或独立 `platform_admin_users/platform_admin_sessions`。
- RLS / policy：普通 PG + server-side repository 权限校验替代。
- `auth.uid()`：由 app session 当前用户解析替代。
- Supabase RPC `redeem_invitation_code`：第一阶段已有 PG repository 对商家 owner path 的替代，正式注册 API 仍需迁。
- Supabase RPC `match_knowledge_chunks`：迁为普通 SQL / pgvector 查询函数或 repository 内 SQL。
- `supabase_storage`：对新数据应退场；历史兼容保留到迁移完成。

## 7. 推荐迁移顺序

### P0：先解除核心运行阻塞

1. 增加 ordinary PostgreSQL schema：咨询三表、商家策略资产、知识库三表、pgvector 函数/索引、平台 admin 独立 auth 表、Agent route 最小表。
2. 为 `consultation-repository.ts` 增加 PG path，保证会话、消息、事件、roundtable state durable。
3. 为 `merchant-strategy-asset-repository.ts` 增加 PG path，保证策略快照和内容日历沉淀不依赖 Supabase。
4. 为 `knowledge-repository.ts` 增加 PG path，先支持文档/chunk/job + text fallback，再接 pgvector。
5. 为平台 admin 登录建立 app-owned admin session，解除 Agent 控制台和平台设置对 Supabase Auth 的硬依赖。

### P1：补齐控制面和素材/导入链路

1. 迁 `agent-console-repository.ts` 的 Agent 配置、prompt/soul、skills、knowledge sets、route binding。
2. 迁 `platform-admin-repository.ts` 的 platform settings、admin events、merchant/invitation 管理视图。
3. 迁 `import-repository.ts` 写路径：create/update/upsert/count。
4. 迁 `material-library-repository.ts` 和 `material_workbench_references`。
5. 补迁正式注册 / 邀请 API 的 app-owned user create path。

### P2：退出兼容层

1. 清理 `supabase_storage` 新写入路径，保留历史读取兼容到迁移完成。
2. 移除 Vercel staging canonical redirect 对国内生产的影响。
3. 新增 `aliyun_oss` adapter，扩展 app 上传、预览签名、worker download/upload。
4. 在所有目标环境切换完成后，再移除 `SUPABASE_DB_URL` fallback 和 Supabase client 依赖。

## 8. 当前不能声称完成的事项

不能声称：

- 咨询台已 PostgreSQL durable。
- 知识库 / RAG 已 PostgreSQL durable。
- Agent 控制台已脱离 Supabase Admin。
- 平台管理 Auth 已脱离 Supabase Auth。
- 导入 / 素材 / 历史已全量 PostgreSQL durable。
- Aliyun OSS 已验证。
- Vercel 已完全退出。

可以声称：

- `codex/domestic-infra-migration` 已备份到 Gitee 同名分支。
- 视频主链路第一阶段 ordinary PostgreSQL + Tencent COS + worker 路径已有实现和验证记录。
- 本轮已完成全量 Supabase / Vercel exit audit，并明确了 Phase 2 迁移范围与阻塞点。

## 9. 下一步建议

建议下一轮不要直接大爆炸迁移，先二选一：

1. 先做 P0 schema plan：新增 `docs/架构规范/YYYY-MM-DD-selfhost-postgres-full-schema-plan.md`，把上述缺表、auth 替代、pgvector 替代、迁移顺序写成可执行 schema 方案。
2. 或先切 P0 最小代码迁移：只迁咨询 + 商家策略资产 + 知识库 text fallback，不碰 Agent 控制台完整面。
