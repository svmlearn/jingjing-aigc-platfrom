# 2026-05-19 Aliyun Worker Meng Real-Run Integration

## Scope

Batch 10C-0 integrated Meng's worker real-run hardening commit into `codex/domestic-infra-migration`.

Guardrails kept:

- Did not merge or pull all of `gitee/孟_5.13`.
- Did not change DNS, ICP, RDS public access, OSS ACL, or OSS public-access block.
- Did not print, save, or commit env secrets.
- Did not merge `main`.
- Did not write `DOMESTIC_PHASE1_E2E_PASS`.

## Source Commit

- Pre-work backup pushed: `683dd66` to `gitee/codex/domestic-infra-migration`.
- Fetched `gitee`.
- Integrated source commit: `e5c8250 feat: harden video edit real-run chain` from `gitee/孟_5.13`.
- Integration commit: `45c4a55 feat: integrate meng worker real-run hardening`.

Integration method:

- Used `git cherry-pick -n e5c8250`.
- Removed unrelated historical docs and local `.codex/skills` added by that commit from this integration.
- Resolved conflicts manually in worker/OpenStoryline/FireRed files and worker tests.

Conflict handling:

- Preserved domestic Aliyun storage contract from `41cf9a3`.
- Kept `ObjectStorageClient`, not Tencent-only client usage.
- Kept `SUPPORTED_STORAGE_PROVIDERS = {"tencent_cos", "aliyun_oss"}`.
- Kept `default_input_buckets`, input `storage_provider` download propagation, output upload provider selection, and DB writeback using actual provider.
- Integrated Meng voice_profile / pixelle_clone / RunningHub fallback / talking-head audio policy hardening.
- Extended tests without dropping Aliyun OSS regression coverage.

## Local Verification

Passed:

- `node --check app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `node --check app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `node --check app/scripts/check-domestic-storage-provider-smoke.mjs`
- `node --check app/scripts/check-aliyun-oss-signed-put-smoke.mjs`
- `/tmp/jingjing-worker-integration-venv/bin/python -m compileall -q workers/video-worker/worker/app workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline workers/video-worker/tests`
- Worker/OpenStoryline unit tests in the temporary venv: `77` tests passed.
- `cd app && corepack pnpm@10.20.0 typecheck`
- `cd app && corepack pnpm@10.20.0 lint`
- `cd app && corepack pnpm@10.20.0 build`
- `git diff --check`

Note:

- A temporary local venv at `/tmp/jingjing-worker-integration-venv` was used because the global Python did not have `httpx`/`fastapi`.
- `test_processor_contract.py` was adjusted to only stub optional dependencies when they are missing, preventing cross-test `httpx` pollution in a combined run.

## Aliyun Deployment

- Deployed commit: `45c4a55`.
- Release path: `/srv/jingjing-domestic/releases/20260519010540-45c4a55`.
- `/srv/jingjing-domestic/current` points to that release.
- App service: active.
- Nginx: active.
- OpenStoryline service: active.
- Video worker service: active.

Remote build:

- `corepack pnpm@10.20.0 install --frozen-lockfile`
- `corepack pnpm@10.20.0 build`

Worker deployment mode remains the previous Phase 1 systemd venv mode:

- `jingjing-openstoryline-engine.service`: systemd, current adapter `skeleton`.
- `jingjing-video-worker.service`: systemd, `WORKER_MAX_CONCURRENCY=1`.

## Aliyun Validation

Health:

- `/api/health`: ok.
- DB provider: `postgres`.
- Storage provider: `aliyun_oss`.
- Bucket: `jingjing-domestic-phase1-hz`.
- Region: `oss-cn-hangzhou`.

Aliyun OSS app roundtrip:

- Status: ok.
- Signed download status: `200`.
- Download matched upload: true.
- Smoke object deleted: true.

Aliyun OSS signed PUT / CORS:

- Status: ok.
- Origin: `http://8.154.28.41`.
- Preflight status: `200`.
- Allowed methods: `GET, PUT, HEAD`.
- PUT status: `200`.
- Signed download status: `200`.
- Download matched upload: true.
- Smoke object deleted: true.

Worker real IO smoke:

- Status: ok.
- Storage provider: `aliyun_oss`.
- DB `select 1`: ok.
- Required worker tables present: `asset_objects`, `video_edit_jobs`.
- Roundtrip matched upload: true.
- Smoke object deleted: true.

Video-chain API smoke:

- Status: ok.
- Provider: `aliyun_oss`.
- Signed PUT status: `200`.
- Media complete status: `201`.
- Job create status: `201`; no 409 regression.
- Media asset ID: `6ba8f975-28d0-4e33-8158-8d0603a1ac74`.
- Job ID: `5cd575fb-86a9-4dcf-a235-58f7daf5974a`.
- Final job status after worker processing: `succeeded`.
- Final asset ID: `b8370f67-f5e2-41b0-bbe3-2243f7db759c`.

Worker fast-path smoke:

- Status: ok.
- Provider: `aliyun_oss`.
- Job ID: `73ee2f52-c3de-4bf0-bab1-dd092ddae92a`.
- Input media asset ID: `30cecba6-659e-4044-b97b-48948c41b5f5`.
- Final job status: `succeeded`.
- Final stage: `completed`.
- Final video asset ID: `53940bb2-363f-4612-84b6-195c339a1fc3`.
- Final asset storage provider: `aliyun_oss`.
- Final asset bucket: `jingjing-domestic-phase1-hz`.
- Final asset key: `app-storage-provider-smoke/video-results/64207dc4-ef1d-491d-b216-f629eccc46d5/73ee2f52-c3de-4bf0-bab1-dd092ddae92a/final.mp4`.
- Preview status: `200`.
- Preview bytes: `13952`.

RDS:

- Public table count: `45`.
- Smoke jobs `5cd575fb-86a9-4dcf-a235-58f7daf5974a` and `73ee2f52-c3de-4bf0-bab1-dd092ddae92a` are both `succeeded`.

Cleanup:

- Temporary smoke user `meng-integration-smoke-1779124060@example.test` was disabled.
- Smoke jobs and generated assets were retained as validation evidence.

## FireRed Normal No-Voiceover

Normal no-voiceover FireRed was not run in this batch.

Reason:

- The deployed OpenStoryline adapter is still `skeleton`.
- `FIRERED_OPENSTORYLINE_BASE_URL` is empty.
- `FIRERED_PROVIDER_KEY` is empty.

Changing these would require deploying/configuring FireRed runtime beyond the current integration-and-regression scope. Meng's FireRed hardening code is integrated and covered by local unit tests, but the Aliyun runtime remains skeleton fast-path for this batch.

## Residual Risk

- RDS still uses `sslmode=disable`; this remains Phase 1 private-network temporary stance.
- Worker output prefix is still temporarily under `app-storage-provider-smoke/video-results`; add minimum RAM permission for `video-results/*` before production worker runs.
- FireRed normal runtime is not configured on Aliyun yet.
- TTS/voiceover remains out of scope for this batch.

