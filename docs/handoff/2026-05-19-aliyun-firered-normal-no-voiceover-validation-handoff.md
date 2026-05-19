# 2026-05-19 Aliyun FireRed Normal No-Voiceover Validation Handoff

## Status

Batch 10D is blocked before runtime switch.

No code, deployment, DNS, ICP, RDS public access, OSS public access, or secret changes were made.

The current Aliyun worker runtime is still OpenStoryline skeleton. The latest successful Aliyun worker validation remains Batch 10C fast-path with final output under `video-results/*`.

## Branch And Release

- Branch/worktree: `codex/domestic-infra-migration`.
- Pre-work backup pushed: `ece0b99` to `gitee/codex/domestic-infra-migration`.
- Current ECS release: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`.
- `/srv/jingjing-domestic/current` points to that release.

## Remote State

Services:

- `jingjing-domestic-app.service`: active.
- `nginx`: active.
- `jingjing-openstoryline-engine.service`: active.
- `jingjing-video-worker.service`: active.
- `jingjing-firered-openstoryline.service`: missing.
- `firered-openstoryline.service`: missing.

OpenStoryline:

- `/ready`: ready with `engine_adapter=skeleton`.
- `/health`: `fire_red_base_url_configured=false`.
- `/health`: `fire_red_provider_key_configured=false`.

FireRed:

- Port `7860`: closed.
- No FireRed systemd unit was found.
- No `/srv/jingjing-domestic/shared/env/firered.env` file was found.

Env files:

- `/srv/jingjing-domestic/shared/env/app.env`: `600 root:root`.
- `/srv/jingjing-domestic/shared/env/worker.env`: `600 root:root`.
- `/srv/jingjing-domestic/shared/env/openstoryline.env`: missing.
- `/srv/jingjing-domestic/shared/env/firered.env`: missing.

Known empty fields from safe field-status audit:

- `FIRERED_OPENSTORYLINE_BASE_URL`
- `FIRERED_PROVIDER_KEY`

No env values were printed.

## Why Work Stopped

The task requested an immediate stop if real provider key or FireRed runtime secrets were missing.

The required fields are not currently configured on the Aliyun ECS, and no FireRed service exists to receive the OpenStoryline adapter call. Continuing would require inventing, exposing, or handling secrets outside the allowed flow.

## Required Secure Inputs

Before continuing, the user should securely place or confirm these fields on the ECS, without writing values to chat, docs, or Git:

- `FIRERED_PROVIDER_KEY`
- `OPENSTORYLINE_LLM_MODEL`
- `OPENSTORYLINE_LLM_BASE_URL`
- `OPENSTORYLINE_LLM_API_KEY`
- `OPENSTORYLINE_VLM_MODEL`
- `OPENSTORYLINE_VLM_BASE_URL`
- `OPENSTORYLINE_VLM_API_KEY`

For this no-voiceover batch, TTS fields should stay out of scope unless validation shows the runtime entered a voiceover path by mistake.

## Recommended Resume Plan

1. Create `/srv/jingjing-domestic/shared/env/firered.env` with `600 root:root`, containing only required FireRed runtime fields and no committed values.
2. Add a `jingjing-firered-openstoryline.service` unit running `workers/video-worker/openstoryline/firered/run.sh` from the current release.
3. Start FireRed and verify local `/ready`.
4. Set OpenStoryline bridge fields to `fire_red`, including the local FireRed base URL and the same provider key.
5. Restart `jingjing-openstoryline-engine.service` and verify `/ready` reports `engine_adapter=fire_red`.
6. Run Aliyun regressions:
   - `/api/health`: postgres + aliyun_oss.
   - OSS roundtrip.
   - signed PUT/CORS.
   - worker real IO smoke.
   - skeleton rollback/fast-path check if intentionally toggled back.
   - normal no-voiceover FireRed job.
7. Confirm final object key starts with `video-results/` and preview returns `200`.

## Not Done

- No app redeploy.
- No worker redeploy.
- No FireRed service install.
- No runtime adapter switch.
- No skeleton fast-path rerun.
- No normal no-voiceover job.
- No final asset or preview validation.
- No completion marker.

## Next Batch Entry Criteria

Retry Batch 10D only after the required provider and model fields are securely configured on the ECS and FireRed `/ready` can be checked without exposing secrets.
