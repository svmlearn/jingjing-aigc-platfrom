# 2026-05-13 domestic migration completion audit

## 1. Audit outcome

Status: not complete.

This branch has completed the local code baseline and local API smoke path for the first domestic verification chain, but it has not completed the full Completion Gate:

`domestic IP page -> login -> upload material -> create video_edit_jobs -> worker generates final.mp4 -> upload final.mp4 to domestic COS -> page re-signs and downloads final.mp4`

The remaining blocker is external resource availability, not local write access:

- no real domestic PostgreSQL connection string in `app/.env*`, `workers/video-worker/.env*`, or current process env
- no real Tencent COS bucket / region / secret in local env files or process env
- no domestic server target / IP endpoint
- no mobile browser IP verification target

Long task status has therefore been marked `blocked`, not `complete`.

The local long-task contract was tightened after this audit so that completion now requires `docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md` to exist and contain explicit pass markers for mobile browser, `video_edit_jobs`, worker, `final.mp4`, domestic COS, and re-signed download. A pending template now exists at that path, but the completion pass marker is intentionally absent until the real run succeeds.

Latest `check.py --skip-verifier` result: failed only on `phase1_e2e_verification_doc_contains_pass_markers`, as expected.

## 2. Prompt-to-artifact checklist

| Requirement | Evidence | Audit status |
| --- | --- | --- |
| Do not modify `main` directly | Work done in worktree `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`; branch `codex/domestic-infra-migration`; main still has only unrelated Dify untracked files | Pass |
| Use independent branch / worktree | Commits on `codex/domestic-infra-migration`: `22c5a60`, `eced84e`, `dc85a16`, `f831e45`, `e8a92c1` | Pass |
| Do not touch unrelated Dify results | Worktree diff is limited to `app/`, `workers/video-worker/`, and domestic progress/handoff docs | Pass |
| Do not switch `ba-ba-ke.com`, no ICP filing, no production action | No domain / filing / deployment files or production commands changed; handoff records no push / merge / production action | Pass |
| Read required docs in order | Source docs are recorded in `.codex/long-task/contract.json`; implementation follows V2.1 architecture and domestic decision docs | Pass |
| PostgreSQL baseline from Supabase migrations | `app/db/migrations/202605130001_domestic_core_baseline.sql`; executed on temporary PostgreSQL 17 empty DB with `ON_ERROR_STOP=1` | Pass for first-chain local baseline |
| Plain PostgreSQL access layer | `app/src/lib/server-db/postgres.ts` supports `APP_DATABASE_URL`, `DATABASE_URL`, SSL and pool config | Pass |
| Migrate merchant repository | `app/src/lib/db/merchant-repository.ts` delegates to PostgreSQL path when enabled; implementation in `postgres-video-chain-repository.ts` | Pass for first-chain merchant surface |
| Migrate media repository | `app/src/lib/db/media-repository.ts` delegates assert/create/list to PostgreSQL path; `/api/media/complete` API smoke returned `201` | Pass for first-chain media metadata surface |
| Migrate content-draft repository | `app/src/lib/db/content-draft-repository.ts` delegates key draft/variant operations to PostgreSQL path; fixture creates approved video script variant | Pass for first-chain video script surface |
| Migrate video-edit-job repository | `app/src/lib/db/video-edit-job-repository.ts` delegates create/list/get/retry/cancel to PostgreSQL path; `/api/video-edit-jobs` API smoke returned `201` and list returned `200` | Pass for pending-job surface |
| Minimal Auth / session | `app/src/lib/auth/domestic-session.ts`; login route and dashboard auth support domestic session; API smoke returned `303` and wrote `jingjing_session` | Pass |
| Domestic COS config direction | `app/.env.example` and `workers/video-worker/.env.example` use domestic COS region examples; data model stores `bucket_name + storage_key`; `/api/health` checks COS env | Partial: real COS CORS/STS/upload/download not verified |
| Worker moves from `SUPABASE_DB_URL` to `WORKER_DATABASE_URL` | `workers/video-worker/worker/app/config.py`, `db.py`, `main.py`, `real_io_smoke.py`, tests updated | Pass for config and DB code path |
| Worker COS env domestic priority | `real_io_smoke.py` and tests now prefer `WORKER_COS_*`, with shared `COS_*` retained as fallback | Pass |
| Keep worker first phase at `WORKER_MAX_CONCURRENCY=1` | `workers/video-worker/worker/app/config.py` clamps domestic phase to single concurrency; `.env.example` documents it | Pass |
| Worker logs, heartbeat, timeout, failure reason, manual rerun | `video_edit_jobs` columns added; worker DB updates write `worker_id`, heartbeat/timeout/failure fields; retry supports `failed_retryable` and `failed_manual` | Pass in code/tests, not live worker e2e |
| Health check for domestic server | `app/src/app/api/health/route.ts`; local `next start` + temp PostgreSQL + fake COS config returned `200 OK` | Pass for local runtime |
| App environment preflight | `app/scripts/check-domestic-app-env.mjs`; missing-env failure path and temp PostgreSQL success path verified | Pass for app preflight |
| App COS roundtrip preflight | `app/scripts/check-domestic-cos-roundtrip.mjs`; missing-env failure path verified; real put / signed GET / delete awaits real COS credentials | Partial |
| Seed first owner / merchant | `app/db/seeds/domestic_minimal_seed.example.sql`; first and repeat execution passed | Pass |
| Seed video-chain fixture | `app/db/seeds/domestic_video_chain_fixture.example.sql`; creates source item / draft / approved video script and returns draft COS key prefix | Pass |
| App local type/lint/build | `pnpm exec tsc --noEmit --pretty false`, `pnpm lint`, `pnpm build` passed after route changes | Pass |
| Worker tests | `PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m unittest discover -s workers/video-worker/tests` returned `48 tests OK`; compileall passed | Pass |
| Full mobile IP e2e | No domestic server target, no real DB/COS env, no mobile endpoint | Missing |
| Browser direct upload to domestic COS | Only `/api/media/complete` metadata write was smoke-tested with fake COS config; no real COS STS/CORS/upload | Missing |
| Worker final.mp4 generation and domestic COS upload | No real worker run against actual COS assets; dummy local metadata only | Missing |
| Page re-signed final.mp4 download | No final asset exists in real COS; no signed download verification | Missing |
| Push / merge policy | No push and no merge to main | Pass |
| Handoff | `docs/handoff/2026-05-13-domestic-infra-migration-phase-a0-a6-handoff.md` records branch/worktree/commits/verification/blocker | Pass |

## 3. Current branch evidence

Commits ahead of `main`:

- `22c5a60 feat: add domestic postgres video chain baseline`
- `eced84e fix: allow manual video job rerun in postgres mode`
- `dc85a16 chore: add domestic verification health checks`
- `f831e45 test: add domestic video chain fixture`
- `e8a92c1 docs: record domestic resource blocker`

Primary implementation files:

- `app/db/migrations/202605130001_domestic_core_baseline.sql`
- `app/src/lib/server-db/postgres.ts`
- `app/src/lib/auth/domestic-session.ts`
- `app/src/lib/db/postgres-video-chain-repository.ts`
- `app/src/app/api/health/route.ts`
- `workers/video-worker/worker/app/config.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/worker/app/processor.py`

Primary verification docs:

- `docs/progress/2026-05-13-domestic-migration-phase-a0-a6-progress.md`
- `docs/handoff/2026-05-13-domestic-infra-migration-phase-a0-a6-handoff.md`

## 4. Completion decision

Do not mark the long task complete.

The implemented branch is ready for the next real-resource verification step, but the actual target requires live domestic infrastructure and a real mobile IP path. The first future completion evidence should be a new progress entry containing:

- domestic app URL or IP tested
- PostgreSQL host class and migration command result
- COS bucket / region and CORS check result, without secrets
- login evidence from a mobile browser
- actual upload intent and COS object key
- created `video_edit_jobs.id`
- worker claim / heartbeat / success logs
- final `asset_objects` record for `final.mp4`
- re-signed download result from the page
- exact commands and timestamps
