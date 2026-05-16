# 2026-05-16 domestic main integration handoff

## 1. Current goal

Continue `codex/domestic-infra-migration` from the domestic main integration
task brief:

- `docs/handoff/2026-05-16-domestic-infra-main-integration-task-brief.md`

The task is not only "sync main". It covers:

- Phase A audit of main/domestic capabilities and blockers.
- Phase B merge/integration.
- Singapore self-hosted regression.
- Handoff without pushing or merging to `main`.

## 2. Current status

Status: ready for user review / merge decision.

Do not claim domestic Phase 1 complete yet:

- `DOMESTIC_PHASE1_E2E_PASS` was not written.
- `.codex/long-task` should remain blocked.
- Normal FireRed path did not pass in this integration run.
- Aliyun OSS adapter is still not implemented.

## 3. Branch and worktree

- Worktree:
  `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Push: no
- Merge to `main`: no

Relevant commits:

- `a90bff64d87b` - `docs: audit domestic main integration`
- `0d1dd96c942c` - `Merge main into domestic infra migration`
- `4582db65f112` - `fix: harden domestic integration smoke fast path`

The final documentation commit is the branch HEAD after this handoff is
committed.

## 4. Completed

Phase A:

- Read the task brief and current V2.1/V2.3/V2.3.1/V2.4/product/architecture
  docs listed in the brief.
- Wrote audit:
  `docs/progress/2026-05-16-domestic-main-integration-audit.md`.
- Captured main capabilities, domestic capabilities, conflict files,
  PostgreSQL baseline gaps, Supabase-only grading, and OSS blocker.

Phase B code integration:

- Merged `main` into `codex/domestic-infra-migration`.
- Resolved conflicts in video job repository and worker/OpenStoryline files.
- Restored domestic self-hosted test draft API files removed by main.
- Added ordinary PostgreSQL support for main content-generation/team/video
  result paths.
- Extended domestic baseline for content-generation tables and video in-flight
  indexes.
- Preserved domestic app-owned session, PostgreSQL, COS and worker paths.

Post-merge regression hardening:

- Added reusable smoke scripts for:
  - persisted video-chain API payload inspection.
  - owner team invitation + member accept + Dify mock generation.
  - real COS upload + worker completion + signed preview.
- Fixed FireRed streaming fast-path handling.
- Preserved fast-path markers in worker runtime payload.

## 5. Files changed in the latest implementation commit

- `app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `app/scripts/check-domestic-main-integration-smoke.mjs`
- `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `workers/video-worker/worker/app/processor.py`

Integration merge also changed app repositories, migrations, worker contracts
and docs as part of commit `0d1dd96c942c`.

## 6. Validation summary

Local validation passed:

```bash
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered workers/video-worker/worker/app
deploy/domestic/scripts/verify-templates.sh
node --check app/scripts/check-domestic-video-chain-api-smoke.mjs
node --check app/scripts/check-domestic-main-integration-smoke.mjs
node --check app/scripts/check-domestic-video-chain-worker-smoke.mjs
git diff --check
```

Local Python unit test note:

- `python3 -m unittest workers.video-worker.tests.test_openstoryline_engine_adapters`
  did not run because local Python lacks `fastapi`.
- Python syntax compile passed.
- Singapore worker regression exercised the changed runtime path.

Singapore self-hosted regression:

- App health passed at `http://43.160.208.189/api/health`.
- App preflight passed.
- COS roundtrip passed.
- Video-chain API smoke passed after persisted payload inspection fix.
- Team invitation + Dify mock generation + member read smoke passed.
- Worker fast-path smoke passed after stream endpoint fix.

Successful worker fast-path job:

- `7d633822-3a90-45a4-8ae1-f7c205be9429`
- `status=succeeded`
- `current_stage=completed`
- `execution_mode=self_hosted_rehearsal_fast_path`
- `openstoryline_session_id=worker_rehearsal_fast_path`
- `resultAssetCount=1`
- signed preview: `200`, `3693` bytes

## 7. Remote server state

Server:

- `43.160.208.189`

Current release path:

- `/srv/jingjing-selfhost-rehearsal/current`
- symlink target:
  `/srv/jingjing-selfhost-rehearsal/releases/20260516T042005Z-0d1dd96`

Deployment note:

- Commit `0d1dd96c942c` was deployed as the release directory.
- Files from commit `4582db65f112` were rsynced into the current release after
  the stream fast-path bug was found.
- `jingjing-worker-compose.service` was restarted and rebuilt after that patch.

Observed services after final smoke:

- `jingjing-selfhost-app`: up
- `video-worker`: up
- `openstoryline-engine`: up / healthy
- `firered-openstoryline`: up / healthy
- database provider from health: `postgres`
- COS region from health: `ap-singapore`

## 8. Known residual risk

Normal FireRed path did not complete in this run:

- Job: `b78dfee3-7ab0-410a-8f26-575947fc128a`
- It uploaded/downloaded real COS media, then stayed at
  `openstoryline_subtitles` / `75%`.
- It was marked `failed_manual` for audit clarity.

First fast-path attempt before the stream fix also failed:

- Job: `627c8b67-636d-4f27-8276-42603629b9c3`
- It was marked `failed_manual` with
  `fast_path_not_honored_timeout_observed`.

The passed worker smoke proves the self-hosted infrastructure path with the
explicit fast-path flag. It does not prove production normal FireRed completion.

## 9. Suggested next steps

1. Review branch diff and this handoff.
2. If accepted, decide whether to create a clean Singapore release directory
   named after the latest branch HEAD instead of the patched `0d1dd96` release.
3. Re-run or debug the normal FireRed path separately before Phase 1 completion.
4. Implement/grading plan for Aliyun OSS adapter if domestic mainland storage is
   still required.
5. Only after those pass, decide whether to unblock the long-task completion
   gate and write any Phase 1 pass marker.
