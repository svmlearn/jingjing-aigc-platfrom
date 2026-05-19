# 2026-05-19 Aliyun FireRed Normal No-Voiceover Validation

## Scope

Batch 10D was intended to switch the Aliyun worker runtime from the skeleton OpenStoryline adapter to the real FireRed/OpenStoryline no-voiceover path and run one normal no-voiceover job.

Guardrails kept:

- Did not merge `main`.
- Did not write the Phase 1 completion marker.
- Did not change DNS, ICP, RDS public access, OSS ACL, or OSS public-access block.
- Did not print, save, or commit env secrets, AccessKey Secret, RDS password, provider keys, tokens, or cookies.
- Did not deploy app or worker changes.
- Did not start a normal FireRed job after detecting missing runtime secrets.
- Kept TTS/voiceover out of scope.

## Pre-Work Backup

- Pre-work backup pushed: `ece0b99` to `gitee/codex/domestic-infra-migration`.

## Current ECS State

Release:

- `/srv/jingjing-domestic/current`: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`

Services:

- `jingjing-domestic-app.service`: active.
- `nginx`: active.
- `jingjing-openstoryline-engine.service`: active.
- `jingjing-video-worker.service`: active.
- `jingjing-firered-openstoryline.service`: missing.
- `firered-openstoryline.service`: missing.

Env file permissions:

- `/srv/jingjing-domestic/shared/env/app.env`: `600 root:root`.
- `/srv/jingjing-domestic/shared/env/worker.env`: `600 root:root`.
- `/srv/jingjing-domestic/shared/env/openstoryline.env`: missing.
- `/srv/jingjing-domestic/shared/env/firered.env`: missing.

OpenStoryline health:

- `/ready`: `engine_adapter=skeleton`.
- `/health`: `fire_red_base_url_configured=false`.
- `/health`: `fire_red_provider_key_configured=false`.
- Port `7860`: closed.

Earlier field-status audit of `worker.env` showed:

- `FIRERED_OPENSTORYLINE_BASE_URL`: empty.
- `FIRERED_PROVIDER_KEY`: empty.

No raw env values were printed or copied.

## Code-Derived Runtime Requirements

OpenStoryline bridge:

- `OPENSTORYLINE_ENGINE_ADAPTER` must be `fire_red`.
- `FIRERED_OPENSTORYLINE_BASE_URL` must point to the FireRed runtime.
- `FIRERED_PROVIDER_KEY` must be configured before the FireRed adapter will serve `/v1/runs` or `/v1/runs/stream`.

FireRed runtime:

- A FireRed process must be running on the configured base URL, normally port `7860`.
- The runtime uses `FIRERED_PROVIDER_KEY` to authorize worker calls when configured.
- The real chain requires complete model config, either in config or via env:
  - `OPENSTORYLINE_LLM_MODEL`
  - `OPENSTORYLINE_LLM_BASE_URL`
  - `OPENSTORYLINE_LLM_API_KEY`
  - `OPENSTORYLINE_VLM_MODEL`
  - `OPENSTORYLINE_VLM_BASE_URL`
  - `OPENSTORYLINE_VLM_API_KEY`

No-voiceover stance:

- The target job must use `productionConfig.voiceover.enabled=false`.
- TTS provider keys are not part of this batch unless the runtime accidentally enters a voiceover path.

## Stop Decision

The task hit the explicit stop condition before runtime switch:

- Real FireRed provider key is not configured.
- FireRed base URL is not configured.
- No FireRed systemd unit is installed on the Aliyun ECS.
- FireRed port `7860` is not listening.
- FireRed model provider credentials are not present in a dedicated runtime env file.

Because the provider key and model provider secrets are required real runtime inputs, no guessing or generated replacement was attempted.

## Validation Status

Completed:

- Gitee backup push for `ece0b99`.
- Read-only ECS service audit.
- Read-only ECS env field-status audit without values.
- Read-only OpenStoryline `/ready` and `/health` checks.
- FireRed port check.
- Local code audit for FireRed adapter and runtime env requirements.

Not run due stop condition:

- App redeploy.
- Worker redeploy.
- FireRed service creation or restart.
- Skeleton fast-path regression.
- Normal no-voiceover FireRed job.
- Final asset upload.
- Preview validation.

Therefore this batch has no new:

- Job ID.
- Final asset ID.
- Final object key.
- Normal-job failure log path.

## Required User Action

Before retrying Batch 10D, a human must securely provide or confirm the real runtime secrets on the ECS without writing them to chat or Git:

- `FIRERED_PROVIDER_KEY`
- `OPENSTORYLINE_LLM_MODEL`
- `OPENSTORYLINE_LLM_BASE_URL`
- `OPENSTORYLINE_LLM_API_KEY`
- `OPENSTORYLINE_VLM_MODEL`
- `OPENSTORYLINE_VLM_BASE_URL`
- `OPENSTORYLINE_VLM_API_KEY`

The next attempt should create or update the FireRed runtime env file and systemd unit with permissions equivalent to the existing env files, then switch OpenStoryline from skeleton to `fire_red` only after FireRed `/ready` passes locally.

## Residual Risk

- Aliyun remains on skeleton OpenStoryline for worker runtime.
- Batch 10C official `video-results/*` fast-path evidence remains the latest successful Aliyun worker validation.
- RDS SSL remains disabled for Phase 1 private-network deployment.
- FireRed real runtime has not yet been validated on the Aliyun ECS.
- TTS/voiceover remains out of scope.
