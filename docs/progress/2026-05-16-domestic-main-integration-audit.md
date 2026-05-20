# 2026-05-16 domestic main integration Phase A audit

## 1. Scope

This is the Phase A audit before integrating current `main` into
`codex/domestic-infra-migration`.

Goal:

```text
Keep the validated Singapore self-hosted rehearsal path,
then integrate recent main-chain product capabilities from main
without pretending domestic Phase 1 is complete.
```

Boundaries:

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Starting commit: `70bb15b455ee20a21b4d195e1e38211df5cd32de`
- Main reference: local `main`
- Push / merge to main: not allowed in this task
- Domestic marker: do not write `DOMESTIC_PHASE1_E2E_PASS`
- Project long-task: keep `.codex/long-task/active.json` blocked

## 2. Documents read

Task brief:

- `docs/handoff/2026-05-16-domestic-infra-main-integration-task-brief.md`

Product / architecture truth sources:

- `AGENTS.md`
- `docs/README.md`
- `docs/协作/W-M同学协作README.md`
- `docs/产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
- `docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
- `docs/产品文档/V2.3-内容日历驱动图文视频生成PRD.md`
- `docs/产品文档/V2.3.1-中介成员端任务执行与自动成片PRD.md`
- `docs/产品文档/V2.4-内容检索与媒体素材分层路由PRD.md`
- `docs/产品文档/V2.4-声音克隆未来计划.md`
- `docs/产品文档/2026-05-12-MVP北极星计划.md`
- `docs/架构规范/2026-04-28-current-architecture.md`
- `docs/架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
- `docs/架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md`
- `docs/架构规范/2026-05-13-国内化改造分支冻结与恢复断点.md`
- `docs/架构规范/2026-05-15-选题到内容生成全链路产品总纲.md`

Recent main handoff / progress:

- `docs/handoff/2026-05-13-video-workbench-json-contract-cleanup-handoff.md`
- `docs/handoff/2026-05-14-dify-calendar-member-integration-handoff.md`
- `docs/handoff/2026-05-14-dify-member-team-management-handoff.md`
- `docs/handoff/2026-05-14-server-purchase-domestic-migration-zero-memory-handoff.md`
- `docs/progress/2026-05-10-v2.3-team-content-calendar-implementation.md`
- `docs/progress/2026-05-11-v2.3.1-member-app-implementation.md`
- `docs/progress/2026-05-13-cos-run-timestamp-result-mapping.md`
- `docs/progress/2026-05-13-dify-siliconflow-deepseek-v32-test.md`
- `docs/progress/2026-05-14-dify-calendar-member-integration.md`

Domestic branch evidence:

- `docs/handoff/2026-05-16-singapore-self-hosted-rehearsal-handoff.md`
- `docs/progress/2026-05-16-singapore-self-hosted-rehearsal-redeploy.md`
- `docs/handoff/2026-05-15-singapore-self-hosted-rehearsal-runbook.md`
- `docs/progress/2026-05-15-singapore-self-hosted-rehearsal.md`

## 3. Branch delta summary

Command:

```bash
git log --left-right --cherry-pick --oneline HEAD...main
```

Conclusion:

- Domestic-only side contains the self-hosted / PostgreSQL / app-owned session /
  deploy kit / smoke script work, ending at `70bb15b`.
- Main-only side contains Dify calendar generation, team invitations, public
  video job DTO/result preview route, FireRed streaming hardening, and related
  handoff/progress docs.
- This is not a simple fast-forward. The integration must preserve both sides.

Files changed on both sides and likely to conflict:

```text
app/.env.example
app/src/lib/db/local-real-chain-repository.ts
app/src/lib/db/merchant-repository.ts
app/src/lib/db/video-edit-job-repository.ts
app/src/server/api/video-edit-jobs-service.ts
workers/video-worker/docker-compose.yml
workers/video-worker/openstoryline/app/engine_adapters.py
workers/video-worker/openstoryline/firered/agent_fastapi.py
workers/video-worker/tests/test_openstoryline_engine_adapters.py
workers/video-worker/worker/app/processor.py
```

Semantic conflict candidates even if Git does not conflict:

- Main removed the public video-chain test UI / server helper, while domestic
  still needs the env-gated test draft API for self-hosted smoke.
- Main content-generation code writes to Supabase or in-memory demo fallback;
  domestic self-hosted must write to ordinary PostgreSQL.
- Main content-generation migration references `auth.users`; domestic baseline
  uses `app_users`.
- Main video result preview contracts must work with domestic PostgreSQL result
  assets and dynamic re-signing.
- Main FireRed streaming/progress fixes must coexist with the explicit
  `self_hosted_rehearsal_fast_path` test-only path.

## 4. Main capabilities to keep

### 4.1 Dify content calendar batch generation

Main adds:

- Dify final JSON mapper.
- Dify workflow client.
- `content_generation_batches` / `content_generation_jobs`.
- `POST /api/content-generation/batches`.
- `POST /api/content-generation/jobs/run-next`.
- member weekly task display of generated article/video script output.
- merchant daily task “generate week” entry.
- COS image preview helper for Dify image assets.

Product status:

- This is now part of the main chain: content calendar -> Dify -> member week
  tasks.
- Dify must remain a single-item generator; app/system owns batch/job queue,
  retry, progress and persistence.

Domestic integration requirement:

- Add ordinary PostgreSQL schema and repository path.
- Mock final JSON smoke is acceptable for self-hosted regression.
- Do not claim real Dify has passed unless a real key/env is used and recorded.

### 4.2 Merchant team members and invitation codes

Main adds:

- `GET /api/merchant-team`
- `POST /api/merchant-team/invitation-codes`
- `/dashboard/team`
- team management workspace UI
- owner navigation entry

Product status:

- This is the prerequisite for owner -> member -> weekly content generation.

Domestic integration requirement:

- Baseline already has `merchant_team_members` and
  `merchant_team_invitation_codes`.
- Domestic repository already supports accepting member invitations in
  PostgreSQL mode.
- Still missing owner-facing list/create team invitation APIs and persistent
  PostgreSQL repository branches for the main management surface.

### 4.3 Video job public display, progress and result preview

Main adds:

- `PublicVideoEditJobDto`
- public route contract tests
- progress module normalization
- `GET /api/video-edit-jobs/:id/result/:assetId`
- `/api/media/cos-preview`
- stricter create-video-job public JSON contract

Product status:

- This is user-visible proof that worker success is not enough; the page must
  display progress and re-sign result URLs for preview/download.

Domestic integration requirement:

- Preserve dynamic re-signing. Store bucket/key, not long-lived signed URLs.
- Ensure public DTO maps PostgreSQL `result_payload` / `asset_objects` output
  into `resultAssets`.
- Keep domestic browser self-hosted rehearsal coverage for result re-sign.

### 4.4 FireRed / OpenStoryline stability and streaming fixes

Main adds:

- FireRed streaming/progress hardening.
- worker OpenStoryline client and processor contract updates.
- new FireRed MCP tests.

Domestic side adds:

- self-hosted rehearsal fast path, explicitly test-only.
- ordinary FireRed small synthetic job passed once in Singapore.
- worker DB/COS/env-file hardening.

Integration requirement:

- Preserve normal `staging_worker` / FireRed path.
- Preserve `self_hosted_rehearsal_fast_path` only behind explicit payload flag.
- Do not let production/default jobs enter fast path.

## 5. Domestic branch capabilities to preserve

Already validated in the domestic branch:

- Next.js app can self-host outside Vercel.
- App-owned session can log in disposable owner against ordinary PostgreSQL.
- Ordinary PostgreSQL baseline can initialize core video-chain tables.
- `/api/health` reports app/database/COS status.
- App preflight and COS roundtrip scripts work without printing secrets.
- Browser direct COS upload works in Singapore IP-stage after CORS config.
- `media complete` writes asset metadata.
- `video_edit_jobs` can be created from authenticated browser path.
- worker can claim PostgreSQL jobs using `WORKER_DATABASE_URL`.
- worker can download Singapore COS inputs, call OpenStoryline/FireRed, upload
  `final.mp4` / `cover.jpg` / `subtitles.srt`, and write DB results.
- Page can re-sign and fetch preview URLs.
- `deploy/domestic` kit, env templates, systemd/Nginx samples and verification
  scripts exist.

Do not regress:

- `DATABASE_PROVIDER=postgres`
- app-owned session fallback when Supabase env is empty
- `APP_DATABASE_URL` / `WORKER_DATABASE_URL`
- `WORKER_MAX_CONCURRENCY=1`
- `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1` for validation environments only
- no secret printing in scripts/docs

## 6. PostgreSQL baseline gaps

Current domestic baseline contains:

- `app_users`
- `user_sessions`
- `merchant_profiles`
- signup `invitation_codes`
- `merchant_team_members`
- `merchant_team_invitation_codes`
- `source_items`
- `content_drafts`
- `content_variants`
- `asset_objects`
- `video_edit_jobs`
- `daily_content_tasks`
- related core tables and triggers

Missing for current main integration:

1. `content_generation_batches`.
2. `content_generation_jobs`.
3. Content-generation queue indexes.
4. Content-generation update triggers.
5. Main’s video in-flight dedup indexes:
   - `ux_video_edit_jobs_one_in_flight_per_creator_variant`
   - `ux_video_edit_jobs_one_in_flight_per_owner_variant`

Important adaptation:

- Supabase migration uses `auth.users`; domestic baseline must reference
  `public.app_users`.
- Supabase RLS policies are intentionally not copied into baseline. In
  self-hosted mode, permission checks belong in Node API / repository code.

Repository gaps:

- `daily-content-task-repository` currently persists to Supabase or in-memory
  demo, not PostgreSQL.
- `content-generation-repository` from main persists to Supabase or in-memory
  demo, not PostgreSQL.
- `material-library-repository` remains Supabase/in-memory only. This does not
  block a mock Dify job with empty image assets, but it limits self-hosted image
  material retrieval.

## 7. Supabase-only module grading

Already migrated to ordinary PostgreSQL for the self-hosted video path:

- owner login/session
- merchant profile lookup/update enough for owner/member workspace
- merchant team membership read/accept invitation basics
- content draft / variant core path
- asset object core path
- media complete
- video job create/list/detail/retry/cancel/result writeback
- import/source item subset needed for video-chain fixture

Covered by Singapore self-hosted smoke:

- app health
- app-owned owner login
- media upload intent + media complete
- video job creation
- worker claim/render/upload/result DB writeback
- dynamic result re-sign preview

Still Supabase-only but not blocking this integration slice:

- platform admin / agent console
- platform admin knowledge management
- platform settings / membership admin
- consultation repository and full Agent runtime persistence
- material library repository for richer retrieval
- knowledge repository and ingestion
- register-with-invite / onboarding surfaces outside app-owned self-host login

Still Supabase-only and will block domestic staging if the corresponding user
flow is required:

- content-generation batch/job persistence unless PostgreSQL path is added now
- daily content task persistence unless PostgreSQL path is added now
- owner team-management invitation API unless PostgreSQL path is added now
- material/image retrieval from DB for Dify image input, if staging acceptance
  requires real image material retrieval rather than empty/mock image inputs
- full consultation-driven content calendar if domestic staging must start from
  live consultation rather than seeded daily tasks

## 8. OSS adapter blocker

Current domestic branch and Singapore rehearsal still use Tencent COS:

```text
storage_provider = tencent_cos
COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
WORKER_COS_*
```

Formal domestic resource decision now points to:

```text
阿里云 ECS + RDS PostgreSQL + OSS
```

Therefore Aliyun OSS is a blocker before real domestic resource validation can
be called complete.

Adapter surface that must be covered:

- app upload credentials
- browser direct upload
- media complete metadata
- worker input download
- worker output upload for `final.mp4` / cover / subtitles
- dynamic signed preview/download
- smoke scripts
- env templates
- `storage_provider` contract and database checks

This integration can keep Tencent COS for Singapore regression, but the
handoff must state that COS rehearsal does not validate Aliyun OSS.

## 9. Phase B integration plan

1. Merge local `main` into `codex/domestic-infra-migration`.
2. Resolve conflicts by preserving:
   - main business capabilities,
   - domestic PostgreSQL/app-owned-session/self-hosted deployment surface,
   - explicit test-only fast path.
3. Add PostgreSQL baseline for content generation and video job dedup indexes.
4. Add PostgreSQL repository paths for:
   - daily content tasks,
   - content generation batches/jobs,
   - owner team management APIs.
5. Keep Tencent COS in this pass; record Aliyun OSS adapter as domestic blocker.
6. Run required local validation.
7. Rebuild/redeploy to Singapore IP-stage and run self-hosted regression.

