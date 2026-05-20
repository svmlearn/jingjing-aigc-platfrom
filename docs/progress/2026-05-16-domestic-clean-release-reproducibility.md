# 2026-05-16 domestic clean release reproducibility

## 1. Scope

Goal for this round:

- Move the domestic main integration from "auditable" to "remote clean and
  reproducible".
- Do not keep using the rsync-patched `0d1dd96` release.
- Do not push.
- Do not merge to `main`.
- Do not write `DOMESTIC_PHASE1_E2E_PASS`.
- Do not switch `ba-ba-ke.com`, start ICP, or make purchase actions.

Worktree / branch:

- `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- `codex/domestic-infra-migration`

## 2. Clean releases created

### 2.1 Required fdcde3a release

Created from `git archive HEAD` while local HEAD was `fdcde3a`:

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T052337Z-fdcde3a-clean`
- `REVISION`: `fdcde3a`

Build/redeploy:

- ran fresh `pnpm install --frozen-lockfile`
- ran fresh `pnpm build`
- switched `/srv/jingjing-selfhost-rehearsal/current`
- restarted `jingjing-selfhost-app.service`
- rebuilt/restarted `jingjing-worker-compose.service`

This replaced the previously patched release:

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T042005Z-0d1dd96`

### 2.2 Follow-up clean releases for normal FireRed fixes

During normal FireRed debugging, code fixes were made and redeployed from clean
archives:

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T053854Z-51e760f-clean`
- `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`

Final current symlink after this round:

- `/srv/jingjing-selfhost-rehearsal/current`
- target:
  `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`

Final deployed app build:

- fresh `pnpm install --frozen-lockfile`
- fresh `pnpm build`

Final observed containers:

```text
jingjing-selfhost-app: Up
video-worker: Up
openstoryline-engine: Up, healthy
firered-openstoryline: Up, healthy
```

No pending/claimed/preparing/running video jobs remained after cleanup.

## 3. Minimal self-hosted regression on fdcde3a clean release

### 3.1 Health

Passed:

```text
GET http://43.160.208.189/api/health
ok: true
database.provider: postgres
cos.region: ap-singapore
```

### 3.2 App preflight

Passed in `jingjing-selfhost-app`:

```bash
node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint
```

Evidence:

- `database_url`: ok from `APP_DATABASE_URL`
- `DATABASE_PROVIDER`: `postgres`
- `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED`: enabled
- required tables present

### 3.3 COS roundtrip

Passed:

```bash
node scripts/check-domestic-cos-roundtrip.mjs \
  --prefix selfhost-rehearsal/clean-fdcde3a-app-cos-smoke
```

Evidence:

- signed download status: `200`
- bytes: `32`
- content matched
- object deleted

### 3.4 Team invite and Dify mock

Passed in a temporary app container with only that container carrying
`DIFY_MOCK_FINAL_RESULT_JSON`.

Evidence:

```text
teamBeforeStatus: 200
invitationStatus: 201
acceptStatus: 201
teamAfterStatus: 200
batchStatus: 202
batchId: 9fd18426-42b5-4224-9268-60d75cd6c8f8
batchDb.status: completed
batchDb.total_jobs: 3
batchDb.succeeded_jobs: 3
memberJob.id: b8dc22e0-3653-4a68-a3f3-8a2d55ee1ed6
memberJob.status: succeeded
memberReadStatus: 200
member article/video generationStatus: succeeded / succeeded
```

Temporary container was removed after the smoke.

### 3.5 Video-chain API smoke

Passed while worker was intentionally stopped to avoid consuming a
contract-only fake media job.

Evidence:

```text
status: ok
loginStatus: 303
testDraftStatus: 201
uploadIntentStatus: 201
uploadIntentCredentialsPresent: true
mediaCompleteStatus: 201
jobCreateStatus: 201
jobId: 5ebb1054-3edb-4e6d-b671-6350c955c4be
jobStatus: pending
renderMode: asset_driven
inputAssetCount: 1
persistedJobPayloadInspected: true
```

Cleanup:

- job `5ebb1054-3edb-4e6d-b671-6350c955c4be` was marked
  `failed_manual/api_smoke_contract_only`.
- Reason: API smoke validates contract/persistence only and does not upload
  media bytes.

### 3.6 Worker fast-path smoke

Passed on `fdcde3a` clean release:

```text
jobId: c0ea6d75-73a2-4106-bf48-6624e63ab3ed
finalJobStatus: succeeded
finalStage: completed
resultAssetCount: 1
previewStatus: 200
previewBytes: 3693
selfHostedFastPath: true
```

Passed again on final `e28791c` clean release after FireRed fixes:

```text
jobId: 731d6aa9-83f2-4a5a-ad74-8b1e9ecf2258
finalJobStatus: succeeded
finalStage: completed
resultAssetCount: 1
previewStatus: 200
previewBytes: 3693
selfHostedFastPath: true
```

## 4. Normal FireRed debugging

### 4.1 Attempt 1 on fdcde3a clean release

Job:

- `44ede6cf-5efe-46b5-b317-111beac37bc9`

Result:

- failed / timed out
- marked `failed_manual`
- final stage:
  `normal_firered_generate_script_timeout_observed`

Evidence:

```text
current_stage before cleanup: openstoryline_subtitles
progress_pct: 75
last_event_name: generate_script
last_event_message: still working: generating script for 1 group(s)
```

Logs captured:

- `/srv/jingjing-selfhost-rehearsal/logs/20260516-fdcde3a-normal-firered-44ede6cf-5efe-46b5-b317-111beac37bc9/video-worker.log`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-fdcde3a-normal-firered-44ede6cf-5efe-46b5-b317-111beac37bc9/openstoryline-engine.log`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-fdcde3a-normal-firered-44ede6cf-5efe-46b5-b317-111beac37bc9/firered-openstoryline.log`

Root cause found:

- FireRed agent reached `storyline.generate_script`.
- The locked worker script was still being routed through LLM script generation.
- No result/error returned within the smoke window.

Code fix added:

- `GenerateScriptNode` now bypasses LLM regeneration when `user_request`
  explicitly contains `Use the locked script:`.

### 4.2 Attempt 2 on 51e760f clean release

Job:

- `1ef544df-1b0d-4ade-a8f6-e1a8b620406e`

Result:

- failed / timed out
- marked `failed_manual`
- final stage:
  `normal_firered_custom_script_shape_timeout_observed`

Evidence:

- FireRed agent sent:
  `custom_script: { title, subtitle_units }`
- `GenerateScriptNode` expected:
  `custom_script: { title, group_scripts }`
- This malformed-but-real agent payload still fell back toward the slow LLM path.

Logs captured:

- `/srv/jingjing-selfhost-rehearsal/logs/20260516-51e760f-normal-firered-1ef544df-1b0d-4ade-a8f6-e1a8b620406e/video-worker.log`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-51e760f-normal-firered-1ef544df-1b0d-4ade-a8f6-e1a8b620406e/openstoryline-engine.log`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-51e760f-normal-firered-1ef544df-1b0d-4ade-a8f6-e1a8b620406e/firered-openstoryline.log`

Code fix added:

- `GenerateScriptNode` now normalizes the real
  `{title, subtitle_units}` payload into valid `group_scripts`.

### 4.3 Attempt 3 on e28791c clean release

Job:

- `c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5`

Result:

- failed / timed out
- marked `failed_manual`
- final stage:
  `normal_firered_tts_param_inference_timeout_observed`

Evidence:

```text
generate_script blocker: cleared
current_stage before cleanup: openstoryline_voiceover
progress_pct: 75
last_event_name: generate_voiceover
last_event_message: still working: inferring TTS parameters for provider=bytedance
```

Logs captured:

- `/srv/jingjing-selfhost-rehearsal/logs/20260516-e28791c-normal-firered-c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5/video-worker.log`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-e28791c-normal-firered-c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5/openstoryline-engine.log`
- `/srv/jingjing-selfhost-rehearsal/logs/20260516-e28791c-normal-firered-c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5/firered-openstoryline.log`

Conclusion:

- The original `generate_script` stall is fixed.
- Normal FireRed still cannot be claimed passed.
- The current blocker is TTS/provider runtime:
  `generate_voiceover` waits while inferring TTS parameters for
  `provider=bytedance`.

Needed next evidence:

- Whether normal production should run with voiceover enabled by default in this
  self-hosted smoke.
- If yes, provide/verify TTS provider config and LLM sampling evidence for
  `generate_voiceover`.
- If no, add an explicit normal-smoke production config that disables voiceover
  and validates the render path separately.

## 5. Local validation

Passed:

```bash
python3 -m unittest workers/video-worker/tests/test_firered_generate_script_locked.py
python3 -m compileall workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_script.py workers/video-worker/tests/test_firered_generate_script_locked.py
python3 -m compileall workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_script.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/openstoryline/app workers/video-worker/worker/app
git diff --check
```

Earlier in this integration line, app build/lint/typecheck and clean remote
app builds also passed. The final `e28791c` app was built remotely from a clean
archive.

## 6. Final state

Final local HEAD:

- `e28791c` - `fix: use locked script in firered generation`

Final remote current release:

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`

Final service state:

- app health: ok
- database provider: postgres
- COS region: ap-singapore
- worker/OpenStoryline/FireRed containers: up, OpenStoryline and FireRed healthy
- active video jobs: none

Still not done:

- no push
- no merge to `main`
- no `DOMESTIC_PHASE1_E2E_PASS`
- no `ba-ba-ke.com` switch
- no ICP action
- normal FireRed path is not passed
- long-task remains blocked
