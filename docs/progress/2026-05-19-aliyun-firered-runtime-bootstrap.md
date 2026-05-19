# 2026-05-19 Aliyun FireRed Runtime Bootstrap

## Scope

Batch 10D-1 moved the Aliyun worker runtime from the existing skeleton adapter to the real FireRed/OpenStoryline no-voiceover path.

Guardrails observed:

- No DNS, ICP, RDS public access, or OSS public access changes.
- No app/worker secrets printed or committed.
- No ASR model migration. The Singapore ASR model remains out of scope and can later be replaced by a cloud path.
- No TTS/voiceover validation. This batch is no-voiceover only.

## Baseline

- Branch: `codex/domestic-infra-migration`
- Starting HEAD pushed to Gitee backup: `8421c19`
- ECS: `ubuntu@8.154.28.41`
- Current release path: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- App/storage baseline retained: PostgreSQL RDS plus Aliyun OSS `jingjing-domestic-phase1-hz`

## Runtime Env Migration

Migrated only the approved FireRed/OpenStoryline whitelist fields from Singapore `/etc/jingjing/worker.env` into Aliyun `/srv/jingjing-domestic/shared/env/worker.env`.

Whitelist field status on Aliyun after migration:

| Field | Status |
|---|---|
| `FIRERED_OPENSTORYLINE_BASE_URL` | SET |
| `FIRERED_PROVIDER_KEY` | SET |
| `OPENSTORYLINE_LLM_MODEL` | SET |
| `OPENSTORYLINE_LLM_BASE_URL` | SET |
| `OPENSTORYLINE_LLM_API_KEY` | SET |
| `OPENSTORYLINE_VLM_MODEL` | SET |
| `OPENSTORYLINE_VLM_BASE_URL` | SET |
| `OPENSTORYLINE_VLM_API_KEY` | SET |

Aliyun runtime fields after bootstrap:

| Field | Status |
|---|---|
| `OPENSTORYLINE_ENGINE_ADAPTER` | SET to `fire_red` |
| `OPENSTORYLINE_CONFIG` | SET to the no-ASR FireRed config |
| `WORKER_STORAGE_PROVIDER` | SET |
| `WORKER_ALIYUN_OSS_RESULT_PREFIX` | SET to official `video-results` prefix |
| `REAL_IO_SMOKE_STORAGE_PREFIX` | SET under `video-results/worker-real-smoke` |

Backups created on ECS:

- `/srv/jingjing-domestic/backups/worker.env.before-firered-runtime-20260519T103153`
- `/srv/jingjing-domestic/backups/worker.env.before-adapter-fire-red-20260519T114203`
- `/srv/jingjing-domestic/backups/worker.env.before-aliyun-result-prefix-20260519T114405`
- `/srv/jingjing-domestic/backups/worker.env.before-real-io-prefix-20260519T114609`

## FireRed Service

Created and started:

- `jingjing-firered-openstoryline.service`

Runtime layout:

- FireRed venv: `/srv/jingjing-video-worker/venv-firered`
- Persistent runtime root: `/srv/jingjing-video-worker/firered`
- Persistent outputs: `/srv/jingjing-video-worker/firered/outputs`
- Persistent `.storyline`: `/srv/jingjing-video-worker/firered/.storyline`
- Empty `.storyline/skills` directory was created on Aliyun to satisfy FireRed runtime initialization. It is not a secret and is not the ASR model.

Deployment route:

- Docker Hub base image pull failed from Aliyun, and Singapore image transfer was too large/slow.
- Final route used current release code plus server-local venv/systemd.
- Singapore temporary Docker image tar files were removed after venv/systemd succeeded.

Health checks:

- FireRed `/api/ready`: passed, `status=ready`, runtime assets present.
- OpenStoryline `/ready`: passed, `engine_adapter=fire_red`.
- Services active: `jingjing-domestic-app.service`, `nginx`, `jingjing-firered-openstoryline.service`, `jingjing-openstoryline-engine.service`, `jingjing-video-worker.service`.

## Code Fix

The Aliyun no-voiceover run exposed a narrow worker/OpenStoryline contract issue:

- Job input had `voiceover.enabled=false`, `bgm.enabled=false`, `subtitles.enabled=false`.
- FireRed interceptor still treated locked script groups as voiceover script and kept `tts` / `music_rec` timeline dependencies.

Fix:

- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
  - Preserve default voiceover/BGM behavior when no production config exists.
  - When `voiceover.enabled=false`, mark locked script groups as original-video-audio, `skip_voiceover=true`, `voiceover_enabled=false`.
  - When planning timeline with disabled voiceover/BGM, remove optional `tts` and `music_rec` dependency kinds.
- `workers/video-worker/tests/test_firered_node_interceptors.py`
  - Added no-voiceover locked-script and timeline dependency tests.

ECS backup before patching current release:

- `/srv/jingjing-domestic/backups/node_interceptors.py.before-no-voiceover-contract-20260519T120925`

## Verification

Local verification:

- `python3 workers/video-worker/tests/test_firered_node_interceptors.py`: passed, 12 tests.
- `python3 workers/video-worker/tests/test_firered_generate_voiceover_contract.py`: passed, 6 tests.
- `PYTHONPATH=workers/video-worker /tmp/jingjing-worker-integration-venv/bin/python -m unittest discover workers/video-worker/tests`: passed, 104 tests.
- `python3 -m compileall -q workers/video-worker/worker workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline`: passed.
- `node --check app/scripts/check-domestic-video-chain-worker-smoke.mjs`: passed.
- `git diff --check`: passed.
- `npm run typecheck --prefix app`: passed.
- `npm run lint --prefix app`: passed.
- `npm run build --prefix app`: passed.

Remote verification:

- `/api/health`: `ok=true`, database provider `postgres`, storage provider `aliyun_oss`.
- App Aliyun OSS roundtrip: passed.
  - Key: `app-storage-provider-smoke/b4625709-3bd1-493d-8a35-eb474fd74115.txt`
  - Signed download: `200`
  - Matched and deleted: true.
- Aliyun signed PUT/CORS:
  - Origin: `http://8.154.28.41`
  - Key: `draft-inputs/signed-put-smoke/c648ec72-4e75-43bd-a2ea-b6415912b404.txt`
  - Preflight: `200`
  - PUT: `200`
  - Signed download: `200`
  - Matched and deleted: true.
- Worker `real_io_smoke`:
  - Storage provider: `aliyun_oss`
  - DB status: `ok`
  - Storage status: `ok`
  - Key: `video-results/worker-real-smoke/98ca28f7c0114a37997921af54da6d9b.txt`
  - Matched and deleted: true.

Normal no-voiceover FireRed job:

- Report dir: `/srv/jingjing-domestic/logs/firered-normal-no-voiceover-20260519T121154`
- Job id: `415f3639-5329-48b3-b80f-3bb1968ed67e`
- Media asset id: `02a20a38-07a9-4434-a453-998bda4745ed`
- Final asset id: `7e380308-ebb1-451d-9c22-606c667a68f7`
- Final object key: `video-results/12a0c190-d0da-4c8d-9abf-43bc6872b08a/415f3639-5329-48b3-b80f-3bb1968ed67e/final.mp4`
- Preview status: `200`
- Preview bytes: `324662`

Earlier failed/aborted attempts recorded:

- `6f875b1c-db93-460f-9360-073fb0d820fe`: failed because `.storyline/skills` directory did not exist on the new Aliyun runtime.
- `20cd620b-7bef-44cf-b4bf-9b7e31cb117e`: aborted after identifying the no-voiceover dependency contract issue; replaced by the successful clean run above.

## Rollback

Skeleton rollback:

```bash
sudo sed -i 's/^OPENSTORYLINE_ENGINE_ADAPTER=.*/OPENSTORYLINE_ENGINE_ADAPTER=skeleton/' /srv/jingjing-domestic/shared/env/worker.env
sudo systemctl restart jingjing-openstoryline-engine.service jingjing-video-worker.service
```

Runtime patch rollback:

```bash
sudo install -m 0644 /srv/jingjing-domestic/backups/node_interceptors.py.before-no-voiceover-contract-20260519T120925 \
  /srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
sudo systemctl restart jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
```

## Residual Risk

- FireRed runtime is venv/systemd, not a built Docker image, because Docker Hub access failed from Aliyun.
- Current no-ASR config intentionally excludes local ASR model; ASR/cloud-ASR is a later task.
- TTS/voiceover remains out of scope.
- RDS SSL remains Phase 1 private-network `sslmode=disable` pending later RDS SSL confirmation.
