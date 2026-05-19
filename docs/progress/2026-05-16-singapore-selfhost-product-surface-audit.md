# 2026-05-16 Singapore self-hosted 产品面兼容审计矩阵

## 范围

本轮审计目标是把新加坡腾讯云 `http://43.160.208.189` 作为临时 self-hosted staging，确认最新 `main + codex/domestic-infra-migration` 集成后的产品主流程在 PostgreSQL + Tencent COS + self-hosted worker 上的真实覆盖面。

本轮不是 Aliyun OSS 实现，不切 `ba-ba-ke.com`，不写 `DOMESTIC_PHASE1_E2E_PASS`。

当前远端 release：

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`
- app service: `jingjing-selfhost-app.service`
- worker service: `jingjing-worker-compose.service`
- app public base URL: `http://43.160.208.189`
- app internal port: `127.0.0.1:3002`

## self-hosted 数据库基线

`jingjing-selfhost-pg` 当前 public tables：

- `app_users`
- `asset_objects`
- `audience_profiles`
- `content_drafts`
- `content_generation_batches`
- `content_generation_jobs`
- `content_variants`
- `daily_content_tasks`
- `import_jobs`
- `imported_comments`
- `invitation_codes`
- `merchant_memberships`
- `merchant_profiles`
- `merchant_team_invitation_codes`
- `merchant_team_members`
- `source_items`
- `user_sessions`
- `video_edit_jobs`

当前 PostgreSQL extensions：

- `pgcrypto`
- `plpgsql`

缺口：

- 无 `consultation_sessions` / `consultation_messages` / `consultation_events`
- 无 `knowledge_documents` / `knowledge_chunks` / `knowledge_ingestion_jobs`
- 无 `agent_configs` / `agent_route_bindings` / `agent_skills` / `knowledge_sets`
- 无 `vector` extension，也无 `match_knowledge_chunks` RPC

结论：内容生成、团队、每日任务、媒体资产、视频任务已覆盖 PostgreSQL；咨询、知识库、Agent 控制台目前在 self-hosted 环境只能算页面/API 与内存 fallback smoke，不是 PostgreSQL 持久化完成。

## 产品面矩阵

| 产品面 | URL / API | 主要实现入口 | 主要表 / 存储 | 关键 env | 本轮 smoke | 结论 / 阻塞 |
|---|---|---|---|---|---|---|
| health / app preflight | `GET /api/health` | `app/src/app/api/health/route.ts` | PostgreSQL health, COS config | `DATABASE_PROVIDER=postgres`, `APP_DATABASE_URL`, `COS_*` | PASS: `ok=true`, database provider `postgres`, COS bucket `jj-content-staging-1341668543`, region `ap-singapore` | 基础 app + DB + COS 可用。 |
| owner login/session | `POST /api/auth/merchant-login` | `app/src/app/api/auth/merchant-login/route.ts`, `app/src/lib/auth/domestic-session.ts` | `app_users`, `user_sessions`, `merchant_profiles` | `APP_SESSION_*`, `APP_DATABASE_URL` | PASS: login status `303`, cookie present | 国内 session 路径可用。 |
| merchant team / invite | `GET /api/merchant-team`, `POST /api/merchant-team/invitation-codes` | `app/src/lib/db/merchant-repository.ts`, `app/src/lib/db/postgres-video-chain-repository.ts` | `merchant_team_members`, `merchant_team_invitation_codes`, `app_users` | `DATABASE_PROVIDER=postgres` | PASS: `teamBefore=200`, invite create `201`, `teamAfter=200` | PostgreSQL 路径可用。 |
| member accept invite | `POST /api/member/invitations/accept`, `/member/invite` | `merchant-repository.ts`, `register-with-invite` / member invite routes | `merchant_team_members`, `merchant_team_invitation_codes`, `app_users` | `APP_DATABASE_URL` | PASS: accept status `201`, active member count `1` in smoke run | 成员加入链路可用。 |
| content calendar / daily tasks | `/member/calendar`, `GET /api/daily-content-tasks`, `GET /api/member/tasks/today`, `GET /api/member/tasks/week` | `daily-content-task-service.ts`, `daily-content-task-repository.ts` | `daily_content_tasks` | `DATABASE_PROVIDER=postgres` | PASS: Dify batch smoke 后 member today `200`, article/video generation status `succeeded` | PostgreSQL 持久化路径可用。 |
| Dify batch generation | `POST /api/content-generation/batches`, `POST /api/content-generation/jobs/run-next` | `content-generation-batch-service.ts`, `content-generation-repository.ts`, `dify-workflow-client.ts` | `content_generation_batches`, `content_generation_jobs`, `daily_content_tasks`, `content_drafts`, `content_variants` | `DIFY_MOCK_FINAL_RESULT_JSON` for mock; real path needs `DIFY_API_KEY` / `DIFY_BASE_URL` | PASS with temp Dify mock: batch `866b26f0-2877-4ff1-a87e-5ac0e0e16805`, 4/4 jobs succeeded | Mock workflow path可用；真实 Dify provider 未在本轮验证。 |
| member weekly tasks | `GET /api/member/tasks/week?date=...` and today | `daily-content-task-service.ts` | `daily_content_tasks` | `APP_DATABASE_URL` | PASS via smoke script; member job `0d18c304-1eea-4ad8-895a-0293c416614c` succeeded | 成员端读取生成结果可用。 |
| COS material upload | `POST /api/media/upload-intents`, browser/SDK PUT COS, `POST /api/media/complete` | `media-service.ts`, `cos.ts`, `media-repository.ts` | `asset_objects`; binary in Tencent COS | `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_BUCKET`, `COS_REGION` | PASS: COS roundtrip put/get/delete; video worker smoke actual upload + `mediaComplete=201` | Tencent COS 可用；不是 Aliyun OSS。 |
| video workbench / video job API | `/dashboard/video`, `POST /api/content/video-scripts/test-draft`, `POST /api/video-edit-jobs` | `video-edit-jobs-service.ts`, `video-job-payload.ts`, `video-edit-job-repository.ts` | `content_drafts`, `content_variants`, `asset_objects`, `video_edit_jobs` | `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1` for test draft | PASS: API smoke job `2ef87fe2-55c1-40d6-af1f-cbf3b18b37e6`, render mode `asset_driven`, input asset count `1` | 合约可用。该 contract-only job 后续标为 `failed_manual/api_smoke_contract_only`。 |
| worker fast path | worker consumes `video_edit_jobs`; app polls `/api/video-edit-jobs/[id]` | `workers/video-worker/worker/app/*`, `OpenStorylineClient`, `TencentCosClient` | `video_edit_jobs`, `asset_objects`, COS output | `WORKER_DATABASE_URL`, `WORKER_COS_*`, `OPENSTORYLINE_*` | PASS: job `6030106e-c6b5-481c-b69f-dc2d3843ea3b`, `succeeded/completed`, result assets `1`, preview `200`, bytes `3693` | self-hosted rehearsal fast path 可用。 |
| normal FireRed no-voiceover | same video job API, `productionConfig.voiceover.enabled=false`, `bgm.enabled=false`, `subtitles.enabled=false` | same worker + FireRed/OpenStoryline | `video_edit_jobs`, `asset_objects`, COS output | LLM/VLM provider env, COS, DB; TTS intentionally disabled | PASS: job `3d5324b1-f79b-4615-bb82-d8e6b565768b`, non-fast-path, result assets `3`, preview `200`, bytes `29436` | 正常渲染主干在关闭 TTS/BGM/subtitles 时通过。 |
| result preview / dynamic re-signing | `GET /api/video-edit-jobs/[id]`, `GET /api/video-edit-jobs/[id]/result/[assetId]`, `GET /api/media/cos-preview?path=...` | `video-edit-jobs-service.ts`, `cos.ts` | `asset_objects` with `storage_provider=tencent_cos` | `COS_READ_URL_TTL_SECONDS` | PASS: fast path and normal no-voiceover previews both `200` with non-zero bytes | 稳定 app URL -> 动态 COS signed URL 可用。 |
| consultation / RAG shell | `/dashboard/consultation`, `GET/POST /api/consultation/sessions`, `POST /api/consultation/sessions/[id]/messages`, `GET /api/consultation/experts` | `consultation-service.ts`, `consultation-repository.ts`, `consultation-runtime/*`, `agent-console-repository.ts`, `knowledge-repository.ts` | self-hosted DB 无 consultation/knowledge/agent tables；当前走 in-memory fallback | AI runtime key if full response; Supabase empty in domestic phase1 | PASS as in-memory/API smoke: page `200`, list `200`, create `201`, message processing `completed`, experts count `1` | 页面/API 打开且可处理 demo 会话；不是 PostgreSQL 持久化，也不是 Supabase table 迁移完成。 |
| merchant knowledge base | `GET/POST /api/merchant-knowledge/documents`, settings page user memory | `knowledge-service.ts`, `knowledge-repository.ts`, `cos.ts` | self-hosted DB 无 `knowledge_documents`/`knowledge_chunks`; memory fallback only | `COS_*` for file upload; AI runtime key optional for embeddings | PASS as in-memory smoke: create memory `201`, status `indexed`, chunk count `1`, list after `1` | 自托管 PostgreSQL 没有知识库表；当前成功不代表持久化。 |
| platform admin / agent console | `/platform-admin/agents`, `/api/platform-admin/agents`, `/platform-admin/knowledge` | `agent-console-repository.ts`, platform admin components/routes | self-hosted DB 无 `agent_*` / `knowledge_sets`; memory/demo fallback | Supabase admin if real platform admin persistence | PASS as API/page smoke: agents page `200`, agents API `200`, agent count `1`, route binding count `1` | 控制台 demo surface 可打开；真实 Agent/knowledge-set 管理仍是 Supabase-only / not migrated。 |
| vector search | `searchKnowledgeChunks`, Supabase RPC `match_knowledge_chunks` | `knowledge-repository.ts`, `consultation-runtime/rag.ts` | expected `knowledge_chunks.embedding vector`, `match_knowledge_chunks` | `vector` extension, embedding provider key | DB AUDIT: no `vector` extension, no knowledge tables/RPC | self-hosted PostgreSQL 未具备 pgvector/RAG 持久化检索。当前 RAG smoke 只能算内存 lexical/demo fallback。 |

## 分层结论

1. **self-hosted 已通过**：owner login/session、团队邀请、成员接受邀请、每日任务读取、Dify mock 批量生成、COS 上传/登记、视频 job API、worker fast path、normal no-voiceover FireRed、结果预览重签。
2. **mock-only / in-memory**：咨询会话、用户知识库 memory、平台 Agent 控制台在当前 self-hosted 环境可用，但不是 PostgreSQL 持久化。
3. **Supabase-only / 未迁移**：咨询持久化表、知识库表、Agent console tables、knowledge sets、pgvector/vector RPC。
4. **TTS blocker**：关闭 voiceover 的 normal FireRed 通过；voiceover 路径仍不能声明通过。当前 worker `OPENSTORYLINE_TTS_PROVIDER=minimax` 且 Minimax key 有，但 group/voice/model 缺失；BigTTS appid/access/resource/speaker 缺失。既有日志显示 BigTTS 配置不完整会 fallback bytedance 并出现 401/3001 或卡在 TTS 参数推断。
5. **存储边界**：本轮只验证 Tencent COS `ap-singapore`。Aliyun OSS 仅做设计记录，不做实现、不声明验证。
