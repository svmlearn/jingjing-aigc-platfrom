# 2026-05-19 Aliyun Worker Meng Real-Run Integration Handoff

## Current State

Batch 10C-0 is implemented and validated on Aliyun ECS.

- Branch/worktree: `codex/domestic-infra-migration`.
- Integrated source commit: `e5c8250 feat: harden video edit real-run chain` from `gitee/孟_5.13`.
- Code commit: `45c4a55 feat: integrate meng worker real-run hardening`.
- Deployed release: `/srv/jingjing-domestic/releases/20260519010540-45c4a55`.
- App service: active.
- Nginx: active.
- OpenStoryline service: active, adapter `skeleton`.
- Video worker service: active.
- App and worker storage provider: `aliyun_oss`.

Do not treat this as Phase 1 completion. Do not write `DOMESTIC_PHASE1_E2E_PASS`.

## Integration Notes

Used targeted cherry-pick:

- `git cherry-pick -n e5c8250`.
- Did not merge/pull all of `gitee/孟_5.13`.
- Dropped unrelated historical docs and `.codex/skills` from the cherry-pick result.

Domestic contract preserved:

- App/worker storage contract still accepts both `tencent_cos` and `aliyun_oss`.
- Worker download/upload/DB writeback still uses the actual `storage_provider`.
- Aliyun OSS output upload and `asset_objects.storage_provider = aliyun_oss` regression passed.

Meng hardening integrated:

- voice_profile / pixelle_clone production config normalization.
- Pixelle/RunningHub TTS adapter code path.
- RunningHub fallback service config.
- Talking-head audio policy and ASR/original-audio handling.
- FireRed/OpenStoryline response and error detail hardening.
- Additional worker/OpenStoryline/FireRed tests.

## Validation Summary

Local:

- Worker/OpenStoryline unit tests: `77` passed in `/tmp/jingjing-worker-integration-venv`.
- Python compileall: passed.
- Node smoke script syntax checks: passed.
- App `typecheck`, `lint`, and `build`: passed.
- `git diff --check`: passed.

Aliyun:

- `/api/health`: ok, DB `postgres`, storage `aliyun_oss`.
- OSS roundtrip: ok.
- OSS signed PUT/CORS: ok.
- Worker real_io_smoke: ok.
- Video-chain API smoke: job create `201`, no 409 regression.
- Worker fast-path smoke: succeeded, preview `200`.

Key IDs:

- API smoke job: `5cd575fb-86a9-4dcf-a235-58f7daf5974a`.
- API smoke input media asset: `6ba8f975-28d0-4e33-8158-8d0603a1ac74`.
- API smoke final video asset: `b8370f67-f5e2-41b0-bbe3-2243f7db759c`.
- Worker fast-path job: `73ee2f52-c3de-4bf0-bab1-dd092ddae92a`.
- Worker fast-path input media asset: `30cecba6-659e-4044-b97b-48948c41b5f5`.
- Worker fast-path final video asset: `53940bb2-363f-4612-84b6-195c339a1fc3`.
- Worker fast-path preview: `200`, `13952` bytes.

RDS:

- Public table count: `45`.
- Smoke user `meng-integration-smoke-1779124060@example.test` was disabled after validation.

## FireRed Status

Normal no-voiceover FireRed was not run.

Current Aliyun runtime gates:

- `OPENSTORYLINE_ENGINE_ADAPTER=skeleton`.
- `FIRERED_OPENSTORYLINE_BASE_URL` is empty.
- `FIRERED_PROVIDER_KEY` is empty.

FireRed hardening is integrated and locally tested, but Aliyun remains skeleton fast-path until FireRed runtime configuration is explicitly added.

## Residual Risk

- RDS SSL remains `sslmode=disable` for Phase 1 private-network deployment.
- Worker output prefix is still `app-storage-provider-smoke/video-results`; add RAM permission for `video-results/*` before production output prefix hardening.
- FireRed runtime is not configured on Aliyun.
- TTS/voiceover is still out of scope.

## Next Recommended Batch

Batch 10C can proceed to formal prefix hardening if the user accepts the current validation.

Recommended next steps:

- Add RAM minimum permission for `video-results/*`.
- Move worker output prefix from `app-storage-provider-smoke/video-results` to `video-results`.
- Decide whether Batch 10C includes FireRed runtime configuration or keeps FireRed as a separate batch.
- Keep TTS/voiceover and RDS SSL follow-up separate unless explicitly pulled into scope.

## Push / Merge Status

- Pre-work backup `683dd66` was pushed to Gitee before integration.
- Code commit `45c4a55` exists locally in this migration worktree.
- No merge to `main`.

