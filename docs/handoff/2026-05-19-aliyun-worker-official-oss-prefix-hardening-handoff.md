# 2026-05-19 Aliyun Worker Official OSS Prefix Hardening Handoff

## Current State

Batch 10C is implemented and validated on Aliyun ECS.

- Branch/worktree: `codex/domestic-infra-migration`.
- Code commit: `52ce51d test: assert aliyun worker result prefix`.
- Deployed release: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`.
- `/srv/jingjing-domestic/current` points to the release above.
- App service: active.
- Nginx: active.
- OpenStoryline service: active, skeleton adapter.
- Video worker service: active.
- Worker result prefix: `video-results`.

Do not infer this as full Phase 1 completion. Do not write the completion marker.

## What Changed

RAM policy:

- Policy `jingjing-domestic-phase1-oss-prefix-policy` now defaults to `v2`.
- Added only `acs:oss:*:*:jingjing-domestic-phase1-hz/video-results/*`.
- Actions remain limited to `oss:PutObject`, `oss:GetObject`, `oss:DeleteObject`, `oss:GetObjectMeta`.
- No whole-bucket wildcard was added.

Worker output:

- Changed ECS worker env from temporary `app-storage-provider-smoke/video-results` to official `video-results`.
- Kept `app-storage-provider-smoke/*` only for app storage smoke.

Smoke tooling:

- `check-domestic-video-chain-worker-smoke.mjs` now accepts `--expect-result-prefix` and reports final asset id/provider/bucket/key.
- Full worker unittest discovery was fixed by correcting a test-only `httpx` stub.

## Validation Summary

Local:

- Worker/OpenStoryline/FireRed unittest discovery: `102` passed.
- Python compileall: passed.
- Node syntax check for changed smoke script: passed.
- `git diff --check`: passed.
- App typecheck: passed.
- App lint: passed.
- App build: passed.

Aliyun:

- Public `/api/health`: ok, DB `postgres`, storage `aliyun_oss`.
- Aliyun OSS app roundtrip: ok.
- Aliyun OSS signed PUT/CORS: ok.
- Worker real IO smoke under `video-results/worker-real-smoke/*`: ok.
- Video-chain API smoke: job create `201`, no 409.
- Worker fast-path smoke: succeeded.
- Final asset key is under `video-results/*`.
- Preview returned `200`.

Key validation IDs:

- API smoke job: `0a2d6dc2-f75f-462c-b64a-6347ca095970`.
- API smoke media asset: `44fb5955-38ab-4f4d-9255-8eaaf1ec9f21`.
- Worker fast-path job: `ec553c80-13bc-41d3-863b-319f99f97850`.
- Worker fast-path input media asset: `72f6d914-1ae6-491b-bd1d-396b74fb9534`.
- Worker fast-path final video asset: `c6976766-ae01-4f38-ac99-5b9579a26668`.
- Worker fast-path final object key: `video-results/e150aa8f-5933-4c5d-a9f4-e0a6e8b9bd7b/ec553c80-13bc-41d3-863b-319f99f97850/final.mp4`.
- Worker fast-path preview: `200`, `13952` bytes.

## Not Done

- No DNS change.
- No ICP submission.
- No RDS public access.
- No OSS public ACL or public-access-block change.
- No FireRed real runtime configuration.
- No TTS/voiceover work.
- No merge to `main`.
- No completion marker.

## Residual Risk

- RDS SSL remains disabled for Phase 1 private-network deployment.
- Worker still runs via systemd venv rather than Docker Compose.
- OpenStoryline adapter remains skeleton; FireRed normal no-voiceover should wait for explicit FireRed runtime config.
- RAM policy v1 remains present as a non-default previous version.

## Next Recommended Batch

Batch 10D can focus on deployment hardening rather than storage prefix work:

- Decide whether to keep systemd venv worker deployment or approve a mainland registry mirror for Docker.
- Confirm RDS SSL capability separately and migrate away from `sslmode=disable` if supported.
- Configure FireRed real runtime only when `FIRERED_OPENSTORYLINE_BASE_URL` and provider key handling are ready.
- Then run normal no-voiceover FireRed without expanding into TTS/voiceover.
