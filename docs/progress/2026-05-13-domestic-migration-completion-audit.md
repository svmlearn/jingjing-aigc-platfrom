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

Latest `check.py --skip-verifier` result at `2026-05-13T21:53:57+08:00`: failed only on `phase1_e2e_verification_doc_contains_pass_markers`, as expected. Typecheck, lint, build, and worker compile hard gates passed.

Follow-up commits after the first audit added the missing video workbench test draft route, a reusable API smoke script, and a PostgreSQL-first guard for mixed Supabase/Postgres envs. These improve local and server-side verification coverage, but they still do not satisfy the full mobile + real COS + worker `final.mp4` Completion Gate.

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
| Source item read API in PG mode | `app/src/lib/db/import-repository.ts` now uses PostgreSQL for `listSourceItems`, `getSourceItemById`, and `listImportedComments`; `/api/source-items` API smoke returned `200` | Pass for first-chain read surface |
| Video workbench test draft API | `app/src/app/api/content/video-scripts/test-draft/route.ts`; `createVideoChainTestDraftForUser` writes source item / draft / approved variant through the same repository layer; local PostgreSQL smoke returned `201` and three `productionScenes` | Pass for test-entrypoint surface |
| Minimal Auth / session | `app/src/lib/auth/domestic-session.ts`; login route and dashboard auth support domestic session; API smoke returned `303` and wrote `jingjing_session` | Pass |
| Domestic COS config direction | `app/.env.example` and `workers/video-worker/.env.example` use domestic COS region examples; data model stores `bucket_name + storage_key`; `/api/health` checks COS env | Partial: real COS CORS/STS/upload/download not verified |
| Worker moves from `SUPABASE_DB_URL` to `WORKER_DATABASE_URL` | `workers/video-worker/worker/app/config.py`, `db.py`, `main.py`, `real_io_smoke.py`, tests updated | Pass for config and DB code path |
| Worker COS env domestic priority | `real_io_smoke.py`, tests, and `workers/video-worker/docker-compose.yml` now prefer `WORKER_COS_*`, with shared `COS_*` retained as fallback | Pass |
| Keep worker first phase at `WORKER_MAX_CONCURRENCY=1` | `workers/video-worker/worker/app/config.py` clamps domestic phase to single concurrency; `.env.example` documents it; `real_io_smoke.py` now rejects values above 1 before real smoke | Pass |
| Worker logs, heartbeat, timeout, failure reason, manual rerun | `video_edit_jobs` columns added; worker DB updates write `worker_id`, heartbeat/timeout/failure fields; retry supports `failed_retryable` and `failed_manual` | Pass in code/tests, not live worker e2e |
| Health check for domestic server | `app/src/app/api/health/route.ts`; local `next start` + temp PostgreSQL + fake COS config returned `200 OK` | Pass for local runtime |
| App environment preflight | `app/scripts/check-domestic-app-env.mjs`; missing-env failure path and temp PostgreSQL success path verified | Pass for app preflight |
| App COS roundtrip preflight | `app/scripts/check-domestic-cos-roundtrip.mjs`; missing-env failure path verified; real put / signed GET / delete awaits real COS credentials | Partial |
| Video chain API smoke preflight | `app/scripts/check-domestic-video-chain-api-smoke.mjs`; missing-input path returns only missing key names; temporary PostgreSQL + `next start` success path returned `status=ok`, `jobStatus=pending`, `renderMode=asset_driven`, `inputAssetCount=1` | Pass for API-only smoke; not a substitute for real upload/worker/mobile e2e |
| Seed first owner / merchant | `app/db/seeds/domestic_minimal_seed.example.sql`; first and repeat execution passed | Pass |
| Seed video-chain fixture | `app/db/seeds/domestic_video_chain_fixture.example.sql`; creates source item / draft / approved video script and returns draft COS key prefix | Pass |
| App local type/lint/build | `pnpm exec tsc --noEmit --pretty false`, `pnpm lint`, `pnpm build` passed after route changes | Pass |
| Worker tests | `PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m unittest discover -s workers/video-worker/tests` returned `49 tests OK`; compileall passed | Pass |
| Full mobile IP e2e | No domestic server target, no real DB/COS env, no mobile endpoint | Missing |
| Browser direct upload to domestic COS | Only `/api/media/complete` metadata write was smoke-tested with fake COS config; no real COS STS/CORS/upload | Missing |
| Worker final.mp4 generation and domestic COS upload | No real worker run against actual COS assets; dummy local metadata only | Missing |
| Page re-signed final.mp4 download | No final asset exists in real COS; no signed download verification | Missing |
| Mixed Supabase/Postgres env behavior | `app/src/server/api/video-edit-jobs-service.ts` now checks `isPostgresVideoChainEnabled()` before Supabase admin configuration; production smoke with leftover Supabase env still created `asset_driven` PostgreSQL job | Pass for first-chain job payload assembly |
| Push / merge policy | No push and no merge to main | Pass |
| Handoff | `docs/handoff/2026-05-13-domestic-infra-migration-phase-a0-a6-handoff.md` records branch/worktree/commits/verification/blocker | Pass |

## 3. Current branch evidence

Recent commits ahead of `main` include:

- `61f185d chore: add domestic video chain api smoke`
- `94ac4eb fix: prefer postgres video payload assembly`
- `2d29682 docs: record domestic test draft chain smoke`
- `be10172 feat: add domestic video chain test draft route`
- `c8a74f1 feat: read source items from postgres in domestic mode`
- `fb3c2c2 docs: add domestic phase1 real resource runbook`
- `a849d7f chore: pass domestic worker env through compose`
- `37fbabd chore: add domestic cos roundtrip preflight`
- `36d46d3 fix: prefer worker cos env in real io smoke`
- `0543ca4 chore: add domestic app env preflight`
- `c1d23de docs: add phase1 e2e verification template`
- `9037bb1 docs: add domestic migration completion audit`
- earlier baseline / worker / fixture commits remain in the branch history

Primary implementation files:

- `app/db/migrations/202605130001_domestic_core_baseline.sql`
- `app/src/lib/server-db/postgres.ts`
- `app/src/lib/auth/domestic-session.ts`
- `app/src/lib/db/postgres-video-chain-repository.ts`
- `app/src/app/api/health/route.ts`
- `app/src/app/api/content/video-scripts/test-draft/route.ts`
- `app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `workers/video-worker/worker/app/config.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/worker/app/processor.py`

Primary verification docs:

- `docs/progress/2026-05-13-domestic-migration-phase-a0-a6-progress.md`
- `docs/handoff/2026-05-13-domestic-infra-migration-phase-a0-a6-handoff.md`
- `docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md`

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
