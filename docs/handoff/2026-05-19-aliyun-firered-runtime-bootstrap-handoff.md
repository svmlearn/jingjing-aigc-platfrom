# 2026-05-19 Aliyun FireRed Runtime Bootstrap Handoff

## Current State

Batch 10D-1 is complete for Aliyun normal no-voiceover FireRed validation.

- Branch: `codex/domestic-infra-migration`
- Release path: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- Runtime adapter: `fire_red`
- FireRed service: `jingjing-firered-openstoryline.service`
- App/NGINX/FireRed/OpenStoryline/worker services: active
- Storage provider: `aliyun_oss`
- Worker output prefix: official `video-results/*`

## What Changed

Runtime:

- Migrated only the approved FireRed/OpenStoryline whitelist env fields from Singapore to Aliyun.
- Installed FireRed runtime via venv + systemd on Aliyun.
- Created Aliyun persistent FireRed runtime directories, including an empty `.storyline/skills` directory needed by FireRed startup.
- Did not migrate ASR model.
- Did not configure or validate TTS/voiceover.

Code:

- Added a narrow no-voiceover contract fix in `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`.
- Added focused tests in `workers/video-worker/tests/test_firered_node_interceptors.py`.
- The fix preserves default voiceover behavior unless the worker payload explicitly disables voiceover.

## Validation Evidence

Normal no-voiceover FireRed job:

- Job id: `415f3639-5329-48b3-b80f-3bb1968ed67e`
- Media asset id: `02a20a38-07a9-4434-a453-998bda4745ed`
- Final asset id: `7e380308-ebb1-451d-9c22-606c667a68f7`
- Final object key: `video-results/12a0c190-d0da-4c8d-9abf-43bc6872b08a/415f3639-5329-48b3-b80f-3bb1968ed67e/final.mp4`
- Preview: `200`, `324662` bytes
- Report dir: `/srv/jingjing-domestic/logs/firered-normal-no-voiceover-20260519T121154`

Other remote checks:

- `/api/health`: PostgreSQL + Aliyun OSS.
- FireRed `/api/ready`: ready.
- OpenStoryline `/ready`: ready, adapter `fire_red`.
- App OSS roundtrip: passed.
- Signed PUT/CORS from `http://8.154.28.41`: passed.
- Worker `real_io_smoke`: DB + Aliyun OSS passed under `video-results/worker-real-smoke/*`.

Local checks:

- Focused FireRed interceptor and voiceover tests passed.
- Full worker unittest discovery passed: 104 tests.
- Python compileall passed.
- App typecheck, lint, and build passed.
- `node --check` and `git diff --check` passed.

## Important Paths

- Progress doc: `docs/progress/2026-05-19-aliyun-firered-runtime-bootstrap.md`
- Current release: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- FireRed venv: `/srv/jingjing-video-worker/venv-firered`
- FireRed runtime root: `/srv/jingjing-video-worker/firered`
- Worker env: `/srv/jingjing-domestic/shared/env/worker.env`
- Main env backup: `/srv/jingjing-domestic/backups/worker.env.before-firered-runtime-20260519T103153`
- Runtime patch backup: `/srv/jingjing-domestic/backups/node_interceptors.py.before-no-voiceover-contract-20260519T120925`

## Rollback

To return to skeleton adapter:

```bash
sudo sed -i 's/^OPENSTORYLINE_ENGINE_ADAPTER=.*/OPENSTORYLINE_ENGINE_ADAPTER=skeleton/' /srv/jingjing-domestic/shared/env/worker.env
sudo systemctl restart jingjing-openstoryline-engine.service jingjing-video-worker.service
```

To revert the no-voiceover interceptor patch on ECS:

```bash
sudo install -m 0644 /srv/jingjing-domestic/backups/node_interceptors.py.before-no-voiceover-contract-20260519T120925 \
  /srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
sudo systemctl restart jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
```

## Next Batch Recommendation

Proceed to formal Batch 10E only after deciding the next scope:

- Cloud ASR path design, without copying the Singapore ASR model.
- TTS/voiceover provider validation as a separate task.
- Package FireRed runtime into a reproducible Aliyun-friendly build artifact if Docker Hub remains unreliable.
- Keep RDS SSL confirmation as a separate infrastructure follow-up.

Do not treat this as final domestic completion. This batch only proves Aliyun normal no-voiceover FireRed with PostgreSQL and private Aliyun OSS.
