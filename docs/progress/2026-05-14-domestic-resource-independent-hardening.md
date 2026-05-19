# 2026-05-14 domestic resource-independent hardening

## 1. Scope

This round continues the domestic migration branch without requiring real
domestic cloud resources.

Rules honored:

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- No `main` merge.
- No push.
- No `ba-ba-ke.com` switch.
- No ICP action.
- No fake phase1 e2e evidence.
- No completion marker in the phase1 e2e verification doc.

The real phase1 e2e remains blocked until domestic server, domestic PostgreSQL,
mainland Tencent COS, and a mobile IP access environment exist.

## 2. A0-A9 Current Real Progress

| Stage | Planned scope | Current status | Evidence | Remaining work |
| --- | --- | --- | --- | --- |
| A0 | Branch/worktree isolation | Done | worktree and branch are `codex/domestic-infra-migration`; `main` untouched | None |
| A1 | Plain PostgreSQL access layer | Done for first-chain app DB | `app/src/lib/server-db/postgres.ts` | Broaden beyond first-chain modules later |
| A2 | Plain PostgreSQL baseline | Done for first-chain baseline | `app/db/migrations/202605130001_domestic_core_baseline.sql`; local PG 17 apply passed | Full historical schema migration remains later work |
| A3 | Core repository migration | Done for first video chain | PostgreSQL branches in merchant/media/content-draft/video-edit-job/import source item reads | Non-first-chain repositories still Supabase-based |
| A4 | Minimal auth/session | Done for owner login/dashboard path | `app/src/lib/auth/domestic-session.ts`; login smoke `303`; dashboard auth branch | Invite registration/platform admin auth still not domestic-first |
| A5 | Domestic COS config and signed URLs | Partially done, resource-independent code ready | app COS env, upload intent, metadata complete, signed preview helper, COS roundtrip preflight | Real CORS/STS/browser byte upload/download awaits COS |
| A6 | Worker DB/COS domestic config | Done for config/test surface | `WORKER_DATABASE_URL`, `WORKER_COS_*`, compose env, real_io_smoke, worker tests | Live worker run awaits DB/COS/host |
| A7 | Task reliability | Done for first-chain code/test surface | heartbeat, stale timeout, failure code/reason, retry/manual rerun, stage diagnostics | Live timeout/rerun evidence awaits worker environment |
| A8 | Domestic single-server deployment | Resource-independent materials added this round | `deploy/domestic/**`; readiness checklist | Install and run on purchased server |
| A9 | End-to-end acceptance | Blocked by real resources | pending e2e verification template exists | Mobile browser upload -> worker -> `final.mp4` -> re-signed download |

## 3. Deployment Materials Added

New offline materials:

- `deploy/domestic/README.md`
- `deploy/domestic/env/app.env.example`
- `deploy/domestic/env/worker.env.example`
- `deploy/domestic/nginx/jingjing-domestic.conf`
- `deploy/domestic/systemd/jingjing-app.service`
- `deploy/domestic/systemd/jingjing-worker-compose.service`
- `deploy/domestic/pm2/ecosystem.config.cjs`
- `deploy/domestic/scripts/verify-templates.sh`
- `docs/handoff/2026-05-14-domestic-resource-readiness-checklist.md`

Coverage:

- Nginx reverse proxy sample.
- systemd app service sample.
- systemd Docker Compose worker service sample.
- PM2 app fallback sample.
- app and worker env templates.
- log paths.
- restart commands.
- disk directories.
- ports and firewall/security group checklist.
- server bootstrap directories.
- resource fill sheet.
- expected command results after resources exist.

## 4. Supabase / Vercel Dependency Audit

### Must remove or avoid for phase1 IP e2e

These cannot be relied on for the first domestic IP verification:

| Dependency | Current location | Phase1 decision |
| --- | --- | --- |
| Supabase Auth invite registration | `app/src/app/api/auth/register-with-invite/route.ts` | Avoid in phase1; use seeded `app_users` until domestic invite registration is implemented |
| Platform-admin user creation through Supabase Auth | `app/src/lib/db/platform-admin-repository.ts` | Avoid in phase1; not required for owner video-chain e2e |
| Supabase-only env on domestic app | `.env`/runtime risk | Keep empty in domestic env templates; PostgreSQL mode must be driven by `DATABASE_PROVIDER=postgres` and `APP_DATABASE_URL` |
| Vercel deployment as runtime target | `app/vercel.json`, staging docs | Not used for domestic IP e2e; deploy app on the domestic server |

### Temporarily compatible and intentionally retained

| Dependency | Current location | Reason |
| --- | --- | --- |
| `@supabase/ssr` and `@supabase/supabase-js` packages | `app/package.json` | Needed for existing staging/main compatibility while branch is not merged |
| Supabase fallback in auth/login/proxy | `current-user.ts`, `merchant-login/route.ts`, `proxy.ts` | Bypassed when PostgreSQL mode is configured; preserves old local/staging behavior |
| Supabase fallback in first-chain repositories | merchant/media/content-draft/video-edit-job/import repositories | PostgreSQL branch runs when `isPostgresVideoChainEnabled()` is true; fallback remains for non-domestic environments |
| `SUPABASE_DB_URL` worker fallback | worker config/compose/tests | Compatibility only; domestic env templates prefer `WORKER_DATABASE_URL` |
| `supabase_storage` media enum | contracts and payload mapping | Historical asset compatibility; new domestic writes should use `tencent_cos` |
| Vercel canonical redirect | `app/src/proxy.ts` | Only affects matching `.vercel.app` hosts; domestic IP is not redirected |

### Not in first-stage scope

These modules still contain Supabase Admin SDK paths and should be migrated in
later stages only if they become part of the domestic acceptance scope:

- Knowledge repositories and vector search.
- Agent console repositories.
- Platform admin full management flows.
- Consultation repositories/runtime data.
- Daily content tasks.
- Material library and strategy asset repositories outside the video-chain e2e.
- Full Supabase RLS/Auth migration.
- Vercel deployment and production domain workflows.

## 5. Resource Readiness Checklist

The new checklist is:

```text
docs/handoff/2026-05-14-domestic-resource-readiness-checklist.md
```

It is the bridge between resource purchase and the existing real-resource
runbook:

```text
docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
```

The checklist tells the operator which parameters to fill, which command to
run, and what result to expect before attempting mobile e2e.

## 6. Code Gap Check

No new real-resource-dependent tests were added.

Current first-chain code already has resource-independent coverage for:

- job status enum and worker status validation
- retryable/manual failures
- heartbeat and stale timeout sweep
- stage-specific failure diagnostics
- worker output asset insertion
- COS signed preview URL generation path in app service
- upload intent shape validation in API smoke

Known deliberate gaps:

- real browser byte upload requires COS CORS/STS and cannot be faked here
- worker `final.mp4` generation requires live FireRed/OpenStoryline provider config and COS
- page re-signed download requires a real `tencent_cos` result asset in COS

## 7. Verification Run This Round

Commands run:

```bash
bash deploy/domestic/scripts/verify-templates.sh
cd app && pnpm typecheck
cd app && pnpm lint
cd app && pnpm build
PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m unittest discover -s workers/video-worker/tests
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
docker compose -f workers/video-worker/docker-compose.yml config --quiet
docker compose -f workers/video-worker/docker-compose.yml -f workers/video-worker/docker-compose.firered.yml --profile firered config --quiet
node --check app/scripts/check-domestic-app-env.mjs
node --check app/scripts/check-domestic-cos-roundtrip.mjs
node --check app/scripts/check-domestic-video-chain-api-smoke.mjs
node --check deploy/domestic/pm2/ecosystem.config.cjs
```

Result:

- deployment template smoke passed
- PM2 config syntax passed through `node --check`
- deployment templates do not contain the phase1 completion marker
- app typecheck passed
- app lint passed
- app production build passed; route list still includes `/api/health`, `/api/media/upload-intents`, `/api/media/complete`, `/api/content/video-scripts/test-draft`, `/api/video-edit-jobs`, and `/api/video-edit-jobs/[id]/retry`
- worker tests passed: `Ran 50 tests`
- worker compileall passed
- worker compose config passed for base compose and FireRed profile compose
- app script syntax checks passed

Missing-env failure paths:

```bash
node app/scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint
node app/scripts/check-domestic-cos-roundtrip.mjs
node app/scripts/check-domestic-video-chain-api-smoke.mjs
PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m worker.app.real_io_smoke
```

Expected and observed:

- app env preflight exited `1` and reported only missing key names, including `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED`
- app COS roundtrip exited `2` and reported missing COS key names only
- API smoke exited `2` and reported missing input names only
- worker real I/O smoke exited `2` and reported missing worker DB/COS key names only

## 8. Completion Decision

Resource-independent hardening is locally ready for the next real-resource
purchase step once this commit lands and `git status --short` is clean.

Do not mark the long task complete. The real phase1 e2e remains blocked by
missing real resources.
