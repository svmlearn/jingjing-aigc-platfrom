# 2026-05-16 domestic main integration progress

## 1. Scope

This records Phase B after the Phase A audit in:

- `docs/progress/2026-05-16-domestic-main-integration-audit.md`

Worktree / branch:

- `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- `codex/domestic-infra-migration`

Boundaries kept:

- No push.
- No merge back to `main`.
- No `DOMESTIC_PHASE1_E2E_PASS` marker.
- No `ba-ba-ke.com` switch, ICP action, or purchase action.
- No secrets printed in logs or docs.

## 2. Commits

- `a90bff64d87b` - Phase A audit.
- `0d1dd96c942c` - merge `main` into domestic infra migration.
- `4582db65f112` - post-merge smoke scripts and worker fast-path hardening.

## 3. Code integration completed

Merge conflicts were resolved in:

- `app/src/lib/db/video-edit-job-repository.ts`
- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

Domestic-only validation helpers restored after the merge:

- `app/src/server/api/video-chain-test-draft.ts`
- `app/src/server/api/video-chain-test-draft.test.ts`

PostgreSQL support added/preserved for main features:

- content generation batches/jobs repository path.
- daily content task repository path.
- merchant team invitation/list/create paths.
- video edit job in-flight dedupe on PostgreSQL.
- PostgreSQL result/progress mapping for public video job DTO.
- domestic baseline tables/indexes for `content_generation_batches`,
  `content_generation_jobs`, and video in-flight unique indexes.

Post-merge smoke hardening added:

- `app/scripts/check-domestic-video-chain-api-smoke.mjs` now can inspect
  persisted `video_edit_jobs.input_payload` from PostgreSQL, because the public
  DTO intentionally hides internal input payload fields.
- `app/scripts/check-domestic-main-integration-smoke.mjs` covers owner team
  invite, member accept, Dify mock batch generation, job run, and member read.
- `app/scripts/check-domestic-video-chain-worker-smoke.mjs` covers real MP4
  upload to COS, job creation, worker completion, and signed result preview.
- FireRed worker `/api/worker/runs/stream` now honors
  `worker_rehearsal_fast_path`, matching the non-stream endpoint.
- worker stage runtime payload now preserves `execution_mode` and the explicit
  `self_hosted_rehearsal_fast_path` marker for audit/debug visibility.

## 4. Local validation

Passed:

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

Not run successfully on the local host:

```bash
python3 -m unittest workers.video-worker.tests.test_openstoryline_engine_adapters
```

Result:

- Failed before running tests because the local Python environment does not
  have `fastapi` installed.
- The changed Python files were covered by `compileall`.
- The actual worker path was validated on the Singapore self-hosted stack.

## 5. Singapore deployment state

Server:

- `43.160.208.189`

Release path:

- `/srv/jingjing-selfhost-rehearsal/current`
- current symlink points to
  `/srv/jingjing-selfhost-rehearsal/releases/20260516T042005Z-0d1dd96`

Important note:

- The merge commit `0d1dd96c942c` was deployed as that release.
- After discovering the streaming fast-path gap, files from commit
  `4582db65f112` were rsynced into the current release and the worker compose
  stack was rebuilt.

Database migration:

- Host does not have `psql`; baseline was applied through container
  `jingjing-selfhost-pg`.
- Public table count after baseline: `18`.
- Verified relations include:
  `content_generation_batches`, `content_generation_jobs`,
  `merchant_team_invitation_codes`.

Final observed service state:

```text
/api/health: ok
database.provider: postgres
COS: configured, ap-singapore
video-worker: Up
openstoryline-engine: Up, healthy
firered-openstoryline: Up, healthy
jingjing-selfhost-app: Up
```

Recent video job statuses after the run:

```text
failed_manual: 2
failed_retryable: 3
succeeded: 3
```

The `failed_manual` records are the two explicitly stopped regression attempts
documented below. The `failed_retryable` records are from earlier fake-object
API smoke attempts and are not successful worker regressions.

## 6. Remote regression results

### 6.1 App preflight and COS

Passed in the app container:

```bash
node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint
node scripts/check-domestic-cos-roundtrip.mjs --prefix selfhost-rehearsal/main-integration-app-cos-smoke
```

### 6.2 Video chain API smoke

Passed after the API smoke script was updated to inspect persisted PostgreSQL
payload:

```text
loginStatus: 303
testDraftStatus: 201
uploadIntentStatus: 201
mediaCompleteStatus: 201
jobCreateStatus: 201
jobId: d340406e-7c20-440b-87f4-76c0037afc00
renderMode: asset_driven
inputAssetCount: 1
persistedJobPayloadInspected: true
```

This script validates API contract and persistence. It does not upload media
bytes to COS, so it is not counted as a worker success.

### 6.3 Team invitation and Dify mock generation

Passed in a temporary app container with only that container carrying
`DIFY_MOCK_FINAL_RESULT_JSON`:

```text
teamBeforeStatus: 200
invitationStatus: 201
acceptStatus: 201
teamAfterStatus: 200
batchStatus: 202
batchId: df6ea2ad-9092-4262-bb72-613e54fee910
DB batch: completed, total_jobs=2, succeeded_jobs=2
memberJob: ea5d7b9d-307d-40ff-af2b-5b052b403de6, succeeded
memberReadStatus: 200
member article/video generationStatus: succeeded / succeeded
```

The temporary mock container was removed after the smoke.

### 6.4 Normal FireRed path

Not passed in this integration run.

Attempted job:

- `b78dfee3-7ab0-410a-8f26-575947fc128a`

Observed:

- real MP4 uploaded to COS.
- worker downloaded the input asset.
- job reached `openstoryline_subtitles` at `75%`.
- it did not finish within the integration smoke window.

Action taken:

- worker wait was stopped.
- job was marked `failed_manual` with stage
  `openstoryline_subtitles_timeout_observed`.
- This remains a residual risk for the normal FireRed path after the merge.

### 6.5 First self-hosted fast-path attempt before fix

Attempted job:

- `627c8b67-636d-4f27-8276-42603629b9c3`

Observed:

- input payload had `executionMode=self_hosted_rehearsal_fast_path`.
- worker still went through the normal streaming FireRed path and reached
  `openstoryline_subtitles`.

Root cause:

- OpenStoryline uses `/api/worker/runs/stream` when a progress callback is
  present.
- FireRed `agent_fastapi.py` honored `worker_rehearsal_fast_path` on
  `/api/worker/runs`, but not on `/api/worker/runs/stream`.

Action taken:

- worker was stopped.
- job was marked `failed_manual` with stage
  `fast_path_not_honored_timeout_observed`.
- stream fast-path support was added and the worker stack was rebuilt.

### 6.6 Self-hosted fast-path worker smoke after fix

Passed:

```text
loginStatus: 303
testDraftStatus: 201
uploadIntentStatus: 201
mediaCompleteStatus: 201
jobCreateStatus: 201
jobId: 7d633822-3a90-45a4-8ae1-f7c205be9429
finalJobStatus: succeeded
finalStage: completed
resultAssetCount: 1
previewStatus: 200
previewBytes: 3693
selfHostedFastPath: true
```

DB evidence:

```text
id: 7d633822-3a90-45a4-8ae1-f7c205be9429
status: succeeded
current_stage: completed
execution_mode: self_hosted_rehearsal_fast_path
runtime_fast_path: true
openstoryline_session_id: worker_rehearsal_fast_path
engine_fast_path: true
uploaded_asset_count: 1
```

This validates the infrastructure chain:

```text
browser/app API -> COS direct upload -> PostgreSQL video_edit_jobs ->
worker claim -> OpenStoryline/FireRed fast-path stream ->
COS result upload -> asset_objects/result payload -> signed result preview
```

## 7. Remaining blockers / grading

Domestic Phase 1 remains pending:

- Do not write `DOMESTIC_PHASE1_E2E_PASS`.
- Long-task completion should remain blocked.

Still not implemented:

- Aliyun OSS storage adapter.
- Domestic ICP/domain switch.
- production-grade normal FireRed completion proof after this merge.

Supabase-only grading after integration:

- Core merchant app/session/video/content-generation/team flows now have
  PostgreSQL paths for this branch.
- Supabase migrations and historical Supabase deployment assumptions remain as
  upstream/staging references, not domestic self-hosted truth.
- Any future Supabase-only code path must be re-graded before claiming domestic
  readiness.
