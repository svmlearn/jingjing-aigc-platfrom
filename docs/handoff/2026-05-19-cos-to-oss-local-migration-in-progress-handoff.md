# 2026-05-19 COS-to-OSS local migration in-progress handoff

## 1. Current Goal

This handoff captures the current local-only migration state for moving the existing production video chain away from Tencent COS assumptions and toward the Aliyun OSS production path.

The latest user direction is:

- Do the work locally first.
- Do not deploy, restart, or mutate the OSS target server in this round.
- COS is now only a historical/reference source for diffing production behavior.
- Going forward, the production path should not depend on COS.
- Preserve the already-working Aliyun OSS / RDS PostgreSQL / worker storage contract and the normal no-voiceover video chain.

## 2. Branch and Base

- Worktree: `D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14`
- Branch: `孟_5.13_5.14`
- Current HEAD when this handoff was written: `4f7c0c8a4a64973ff6fe48fa282b93efc7c38ed8`
- Required base commit `e2758df` is an ancestor of current HEAD.
- No push / merge / deploy has been done by this handoff step.

Recent local HEAD:

```text
4f7c0c8 Merge branch 'codex/domestic-infra-migration' ... into 孟_5.13_5.14
e2758df fix: return on dify streaming terminal event
```

## 3. Current Working Tree State

The working tree is dirty and the migration patch is not committed.

Modified tracked files:

```text
app/.env.example
app/scripts/check-domestic-app-env.mjs
app/scripts/check-domestic-storage-provider-smoke.mjs
app/scripts/check-domestic-video-chain-api-smoke.mjs
app/scripts/check-domestic-video-chain-worker-smoke.mjs
app/src/lib/db/voice-profile-repository.ts
app/src/lib/media-upload-contract.test.ts
app/src/lib/media-upload-contract.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/server/api/video-job-payload.test.ts
app/src/server/api/video-job-payload.ts
app/src/server/storage/object-storage.ts
workers/video-worker/.env.example
workers/video-worker/tests/test_processor_contract.py
workers/video-worker/worker/app/config.py
workers/video-worker/worker/app/models.py
workers/video-worker/worker/app/processor.py
workers/video-worker/worker/app/real_io_smoke.py
```

Untracked files/directories already existed or were part of local investigation context. Do not delete or revert them unless the user explicitly asks:

```text
.agents/
.codex/case006_remote_logs_raw.txt
case003_insert_clone_job.sql
case003_insert_clone_job_994290a8.sql
case003_poll_job.sql
case003_poll_job_994290a8.sql
case003_status_query.sql
docs/handoff/2026-05-19-talking-head-aliyun-direct-asr-handoff.md
pending_jobs_query.sql
skills-lock.json
```

Local COS reference snapshots exist under `.tmp/`, including:

```text
.tmp/cos-source-snapshot-20260519-161236
.tmp/cos-source-snapshot-20260519-161350
.tmp/cos-source-snapshot-20260519-161647
.tmp/cos-targeted-snapshot-20260519-162245
```

They are local diff/reference material only and should not be committed.

## 4. What Has Been Changed So Far

### 4.1 App storage defaults and smokes

Current local patch changes app-side defaults from `tencent_cos` to `aliyun_oss` in:

- `app/src/server/storage/object-storage.ts`
- `app/.env.example`
- `app/scripts/check-domestic-app-env.mjs`
- `app/scripts/check-domestic-storage-provider-smoke.mjs`
- `app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `app/scripts/check-domestic-video-chain-worker-smoke.mjs`

Intent:

- New app runtime defaults should point at Aliyun OSS.
- Domestic smoke scripts should default to OSS when no explicit provider is passed.

Important follow-up:

- Re-check whether any smoke script branch still prints or labels COS as the default path.
- Keep COS only as an explicit legacy/reference provider where genuinely needed.

### 4.2 App upload and payload contracts

Current local patch changes:

- `app/src/lib/media-upload-contract.ts`
  - Accepts both `tencent_cos` and `aliyun_oss`.
  - Error copy changed from Tencent-specific bucket wording to generic object storage wording.
- `app/src/lib/media-upload-contract.test.ts`
  - Adds Aliyun OSS accepted upload contract test.
- `app/src/server/api/video-job-payload.ts`
  - User talking-head asset detection no longer hard-requires `tencent_cos`.
  - It accepts supported worker input storage providers.
- `app/src/server/api/video-job-payload.test.ts`
  - Adds Aliyun OSS user talking-head payload coverage.
- `app/src/server/api/video-edit-jobs-service.ts`
  - Stable result download URL now covers `aliyun_oss` result assets as well as legacy COS assets.
- `app/src/lib/db/voice-profile-repository.ts`
  - Voice profile reference audio lookup now accepts `tencent_cos` and `aliyun_oss`.

Important follow-up:

- Because the user said "以后不走 COS 了", decide whether upload complete should still accept `tencent_cos` for legacy reads only, or reject new COS upload completion more aggressively.
- Recommended interpretation: keep read compatibility for old records if needed, but prevent new OSS production workflow from depending on COS. If changing upload completion to OSS-only, update tests and copy accordingly.

### 4.3 Worker storage defaults and fallback

Current local patch changes:

- `workers/video-worker/worker/app/config.py`
  - Default `WORKER_STORAGE_PROVIDER` / `STORAGE_PROVIDER` fallback is now `aliyun_oss`.
- `workers/video-worker/worker/app/models.py`
  - Missing `input_asset.storage_provider` now falls back to a configurable default provider, defaulting to `aliyun_oss`.
- `workers/video-worker/worker/app/processor.py`
  - Passes configured worker storage provider into input asset parsing.
  - Reference audio and output upload fallback provider now defaults to `aliyun_oss`.
- `workers/video-worker/worker/app/real_io_smoke.py`
  - Real IO smoke default provider changed to `aliyun_oss`.
- `workers/video-worker/tests/test_processor_contract.py`
  - Adds configured OSS fallback coverage.
  - Keeps explicit legacy COS configured fallback coverage.

Intent:

- If old or incomplete payloads miss `storage_provider`, a worker configured for OSS should behave as OSS instead of silently assuming COS.
- Explicit legacy COS configuration still works for compatibility tests.

## 5. ASR / Voiceover / TTS Split Warning

`workers/video-worker/.env.example` currently has a local uncommitted change that switches:

```env
OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer
```

and updates the comments to say the OSS production path must not deploy local FunASR.

This is directionally aligned with the ASR plan, but it should not be mixed into the non-ASR storage migration commit if the user still wants separate commits.

Before committing, split the patch:

1. Non-ASR OSS production-chain changes.
2. ASR / TTS / voiceover changes, including provider gate and tests.

Related plan document:

```text
docs/handoff/2026-05-19-talking-head-aliyun-direct-asr-handoff.md
```

Note: that document exists as an untracked local file. It may display mojibake in some PowerShell reads because of encoding, but the intended plan is the talking-head original-audio plus Aliyun direct ASR handoff.

## 6. ASR Plan Still To Implement

The ASR/talking-head plan is not implemented yet in this local patch, beyond the `.env.example` default/comment change mentioned above.

Next implementation items:

- App payload contract:
  - Add/support `productionConfig.subtitles.talkingHeadSource`.
  - Add/support `productionConfig.render.preserveTalkingHeadOriginalAudio`.
  - Talking-head defaults to `asr_original_audio`.
- Worker/OpenStoryline:
  - Enforce `aliyun_paraformer` for `asr_original_audio`.
  - Require `ALIYUN_ASR_API_KEY` or `DASHSCOPE_API_KEY`.
  - Do not fall back to local FunASR.
  - Ensure non-talking-head TTS/no-voiceover paths do not trigger ASR.
- FireRed/OpenStoryline timeline:
  - Map whole-source ASR sentence timings to final timeline windows.
  - Write subtitles into the standard subtitle track.
  - Fail retryably if ASR text is empty or cannot map to the timeline.
- Tests:
  - ASR provider gate test for `aliyun_paraformer`.
  - Missing key failure.
  - No local FunASR loading/fallback.
  - Talking-head original-audio subtitle path.

Useful files for this phase:

```text
workers/video-worker/openstoryline/app/engine_adapters.py
workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py
workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline.py
workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
```

## 7. Validation Status

No validation suite was run as part of this handoff-writing step.

Required validation before final delivery:

```powershell
python -m unittest discover -s workers/video-worker/tests
python -m compileall workers/video-worker/worker workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline
npm run typecheck --prefix app
npm run lint --prefix app
npm run build --prefix app
```

Focused smoke/test requirements from the user:

- OSS storage provider contract.
- Dify content generation `run-next`.
- normal no-voiceover regression on the Aliyun OSS path.
- ASR provider gate: `aliyun_paraformer`, no local FunASR fallback.
- Voiceover/TTS tests if that path is touched.

## 8. Suggested Next Steps

1. Re-read this dirty patch with `git diff`.
2. Decide final COS compatibility rule:
   - Recommended: OSS-only for new production behavior; COS read compatibility only where needed for old/reference records.
3. Adjust upload completion and tests if new uploads should reject `tencent_cos`.
4. Split the current patch into two commits:
   - Commit A: non-ASR OSS production-chain migration.
   - Commit B: ASR / TTS / voiceover / talking-head original-audio migration.
5. Implement the ASR plan from `2026-05-19-talking-head-aliyun-direct-asr-handoff.md`.
6. Run the required local validation commands.
7. Add a progress note under `docs/progress/` summarizing:
   - What changed.
   - What passed.
   - What remains unverified.
8. Keep server untouched until the user explicitly asks for deployment.

## 9. Guardrails For The Next Agent

- Do not deploy to the OSS server in this phase.
- Do not restart Docker or services on the server.
- Do not commit real keys, DB URLs, OSS credentials, DashScope keys, or SSH credentials.
- Do not restore Supabase/COS/Vercel assumptions into the production path.
- Do not regress the already-working normal no-voiceover Aliyun OSS chain.
- Do not silently convert ASR failure into script subtitles or no-subtitle output.
- Do not merge/push unless the user explicitly asks.

## 10. Current Status

Status: in progress, local dirty patch, not committed, not validated.

Owner of next step: continue locally from this worktree, finish the OSS-only production-chain decision, split commits, implement ASR/talking-head plan, then run full validation.
