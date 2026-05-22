# Video Worker

`workers/video-worker/` is the Docker-first execution runtime for the current four-layer media architecture:

- `Next.js app APIs`: frontend and business APIs on the current app deployment target
- `PostgreSQL`: app-owned database and job source of truth
- `Aliyun OSS`: source and generated media object storage
- `Private Docker runtime`: isolated worker host for video execution

This directory intentionally owns only the worker-side responsibilities. It does not expose any public OpenStoryline endpoint and it does not depend on Next.js routes or app migrations living elsewhere in the repo.

## Services

`docker-compose.yml` defines two always-on internal services plus one optional
FireRed profile service:

- `openstoryline-engine`
- `video-worker`
- `firered-openstoryline` when `--profile firered` is enabled

`openstoryline-engine` is the worker-facing HTTP contract service. It keeps the
stable synchronous `/v1/runs` contract and can route to either the local skeleton
runtime or the FireRed service.

The service now has an explicit engine adapter boundary:

- `OPENSTORYLINE_ENGINE_ADAPTER=skeleton` keeps the current contract-preserving placeholder runtime.
- `OPENSTORYLINE_ENGINE_ADAPTER=fire_red` maps the worker `ProductionDirective`
  payload into FireRed's internal `/api/worker/runs` API.
- `FIRERED_OPENSTORYLINE_BASE_URL`, `FIRERED_RUN_TIMEOUT_SECONDS`, and
  `FIRERED_PROVIDER_KEY` configure the private FireRed adapter call; health
  checks expose only whether the provider key is configured, never the key value.

This is deliberate. The worker owns a synchronous `/v1/runs` job contract, while
the full FireRed project remains a session/chat-oriented application behind the
adapter.

## Real OpenStoryline Docker result

The production path for this project is Docker-first:

```text
video-worker
-> openstoryline-engine
-> firered-openstoryline
```

Use `firered.env.example` and the FireRed compose override when the server
should run the real FireRed OpenStoryline engine:

```bash
cp firered.env.example .env
# Set WORKER_DATABASE_URL, WORKER_STORAGE_PROVIDER=aliyun_oss,
# WORKER_ALIYUN_OSS_*, FIRERED_PROVIDER_KEY,
# OPENSTORYLINE_LLM_*, OPENSTORYLINE_VLM_*, and selected TTS_* secrets.
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs}
sudo mkdir -p /srv/jingjing-video-worker/firered/{.storyline,resource/bgms,resource/tts,outputs}
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered up --build
```

The main app still writes `video_edit_jobs`; it does not call FireRed directly.
That keeps merchant permissions, script locking, retries, object storage upload,
and result metadata in the platform contract while the real rendering engine runs in
Docker.

The FireRed source is now vendored under `openstoryline/firered/` so the server
deployment has the same engine source as development. The vendored copy includes
source code, prompts, web assets, scripts, config templates, and dependency
manifests. It intentionally excludes local runtime artifacts such as `.venv/`,
`.downloads/`, `.storyline/`, `resource/`, `outputs/`, logs, and caches. Those
large assets must be installed on the server image or mounted under
`${VIDEO_WORKER_HOST_ROOT}/firered`.

To start the FireRed web/MCP service on the server:

```bash
docker compose --profile firered up --build firered-openstoryline
```

By default the FireRed container downloads missing models/resources at startup
with `DOWNLOAD_FIRERED_ASSETS=true`. The download runs only when
`.storyline/models` or `resource/bgms` are missing, so mounted host directories
stay usable across restarts. If assets are already prepared by deployment
automation, set `DOWNLOAD_FIRERED_ASSETS=false`:

```bash
sudo mkdir -p /srv/jingjing-video-worker/firered/{.storyline,resource,outputs}
```

To route worker jobs through FireRed, set these values in `.env` and run the
compose stack with the `firered` profile plus the FireRed override:

```bash
OPENSTORYLINE_ENGINE_ADAPTER=fire_red
FIRERED_OPENSTORYLINE_BASE_URL=http://firered-openstoryline:7860
FIRERED_PROVIDER_KEY=<private shared key>
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered up --build
```

In FireRed mode, `openstoryline-engine` reports liveness on `/health` and
readiness on `/ready`. Docker Compose uses `/ready`, so `video-worker` waits
until the adapter has the FireRed base URL, shared provider key, and reachable
FireRed `/health` endpoint before polling jobs.

### FireRed production assets

FireRed mode requires runtime assets that are not committed to git:

- `/srv/jingjing-video-worker/firered/.storyline`
- `/srv/jingjing-video-worker/firered/resource/bgms`
- `/srv/jingjing-video-worker/firered/resource/tts/tts_providers.json`
- `/srv/jingjing-video-worker/firered/outputs`

Use one of two setup paths:

1. Default runtime path: keep `DOWNLOAD_FIRERED_ASSETS=true`, so the container
   downloads missing assets into the mounted host directories.
2. Pre-baked image path: set `DOWNLOAD_FIRERED_BUILD_ASSETS=true` when building.
3. Pre-provisioned host path: prepare the host directories before starting
   compose and set `DOWNLOAD_FIRERED_ASSETS=false`.

Provider secrets must stay in `.env` or the deployment secret manager. Do not
write concrete provider keys into FireRed config files.

The FireRed container supervises both its Web service and MCP service. If either
child process exits, the container exits instead of reporting a false healthy
state.

The FireRed worker API uses shared host mounts so it can read worker-downloaded
input files under `/srv/jingjing-video-worker/tmp` and write `final.mp4` back to
the requested `/srv/jingjing-video-worker/outputs/...` job directory.

`video-worker` is the polling worker. It:

1. sweeps stale jobs on boot and before each polling pass
2. claims only the oldest `pending` job
3. downloads input media from configured object storage
4. calls the local `openstoryline-engine`
5. uploads generated outputs back to configured object storage
6. updates `video_edit_jobs` and inserts output `asset_objects`

`failed_retryable` is intentionally not auto-claimed by the worker. The later retry API contract should:

1. increment `retry_count`
2. reset the job back to `pending`
3. clear or overwrite any retry-specific failure state as needed

Only after that state transition will the polling worker see the job again.

## Fixed runtime defaults

The values below follow the staging task doc and are baked into `.env.example`:

- `WORKER_POLL_INTERVAL_SECONDS=10`
- `WORKER_MAX_CONCURRENCY=1`
- `VIDEO_JOB_STALE_MINUTES=120`
- host root: `/srv/jingjing-video-worker`
- mounts:
  - `/srv/jingjing-video-worker/tmp`
  - `/srv/jingjing-video-worker/models`
  - `/srv/jingjing-video-worker/outputs`

## Expected job payload shape

The worker now treats `video_edit_jobs.input_payload` as a small production
contract object, not just a loose render payload. A valid job must include a
locked video script and may include input assets:

```json
{
  "source": "video_workbench",
  "executionMode": "staging_worker",
  "script": {
    "text": "Confirmed narration or script text used for this video task.",
    "locked": true,
    "variantId": "content-variant-id"
  },
  "productionDirective": {
    "targetPlatform": "douyin",
    "aspectRatio": "9:16",
    "desiredOutputs": ["final_video", "cover", "subtitles"],
    "lockedFields": ["script", "cta", "target_user", "claims"]
  },
  "input_assets": [
    {
      "asset_type": "video",
      "storage_provider": "aliyun_oss",
      "bucket_name": "jingjing-domestic-phase1-hz",
      "storage_key": "draft-inputs/merchant-1/draft-1/demo.mp4",
      "file_name": "demo.mp4"
    }
  ]
}
```

`script.text` is mandatory for the current worker contract, and `script.locked`
must be the boolean value `true` when present. If locked script text is missing,
or if `script.locked` is false or malformed, the worker marks the job as
`failed_manual` with a directive validation failure instead of sending an
underspecified task to the engine. Legacy script text inside
`productionDirective` is not accepted as a substitute.

Input asset `file_name` values must be plain file names only. Path fragments,
absolute paths, Windows drive prefixes, and directory separators are rejected as
`failed_manual` contract errors before object storage download. If
`storage_provider` is present, it must be a supported object storage provider;
unsupported providers are rejected before download. If `bucket_name` is present,
it must be a non-empty string; otherwise the worker uses the configured default
bucket for the selected provider. `tencent_cos` remains a legacy compatibility
provider for historical assets; new payloads should use `aliyun_oss`.

`productionDirective` is intentionally lightweight in this stage. It records the
parts of the upstream content decision that the worker and engine must not
silently rewrite. The worker currently normalizes it into an internal directive
and forwards the normalized directive to `openstoryline-engine`.

The worker also derives output object keys from `WORKER_STORAGE_RESULT_PREFIX`:

- `{prefix}/{merchantId}/{jobId}/final.mp4`
- `{prefix}/{merchantId}/{jobId}/cover.jpg`
- `{prefix}/{merchantId}/{jobId}/subtitles.srt`

The default prefix is `video-results`.

## Directive validation and failure mapping

Before downloading assets or calling the engine, `video-worker` validates the
production directive.

Validation failures that require upstream product or content repair are marked
as `failed_manual`. Current examples:

- missing locked script text
- script explicitly marked unlocked or malformed
- requested outputs do not include `final_video`
- present but empty or malformed `desiredOutputs`
- unsupported `desiredOutputs` values outside `final_video`, `cover`, and `subtitles`
- non-object `input_payload`
- malformed `input_assets`, including non-list values, assets missing `storage_key`, malformed bucket names, or unsupported storage providers

Runtime or infrastructure failures stay `failed_retryable` through the existing
processor path. Current examples:

- object storage download failures
- temporary engine failures
- missing files in requested engine outputs
- upload failures
- worker runtime exceptions

Download, engine, and upload failures are recorded with stage-specific
diagnostics: `downloading_inputs_failed` for object storage input download failures,
`openstoryline_rendering_failed` for engine invocation failures, and
`uploading_outputs_failed` for generated output upload failures. If generated
files upload but `asset_objects` cannot be persisted, the job is marked
`asset_objects_persistence_failed` with `asset_objects_insert_failed` in the
failure reason. Engine invocation failures include `engine_run_failed` in the
failure reason.

The normalized directive is also written into the engine request so the skeleton
engine and future real OpenStoryline adapter share the same contract surface.
After engine execution, the worker checks the requested output files before any
object storage upload. Successful jobs include `engine_adapter`, storage-key `outputs`, and
persisted `asset_objects.id` values in `result_payload.uploaded_assets`.
Only requested `desiredOutputs` are uploaded and written back; for example,
`["final_video"]` ignores any cover or subtitle files produced by the engine.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `WORKER_DATABASE_URL`, `WORKER_STORAGE_PROVIDER=aliyun_oss`, `WORKER_ALIYUN_OSS_ACCESS_KEY_ID`, `WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET`, `WORKER_ALIYUN_OSS_BUCKET`, `WORKER_ALIYUN_OSS_REGION`, `WORKER_ALIYUN_OSS_ENDPOINT`, `OPENAI_API_KEY`, and any extra provider keys you need. Legacy database and Tencent COS variables remain compatibility fallbacks for older deployments only.
3. Make sure the host directories exist on the worker machine:

```bash
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs,firered/.storyline,firered/resource,firered/outputs}
```

4. Start the local skeleton stack:

```bash
docker compose up --build
```

This local command uses `.env.example`, which explicitly sets
`OPENSTORYLINE_ENGINE_ADAPTER=skeleton`. Server rendering should use
`firered.env.example` and `docker-compose.firered.yml` instead.

To verify real database and object storage dependencies without printing secrets, run:

```powershell
$env:PYTHONPATH=(Resolve-Path -LiteralPath '.').Path
python -m worker.app.real_io_smoke --env-file .env
```

The smoke prefers `WORKER_DATABASE_URL` and `WORKER_ALIYUN_OSS_*`. Legacy
database and Tencent COS variables remain compatibility fallbacks. It performs a read-only
database check for `video_edit_jobs` and `asset_objects`, enforces
`WORKER_MAX_CONCURRENCY=1` for domestic phase1, then uploads, downloads,
verifies, and deletes one small object under `worker-real-smoke/` in the
configured object storage provider. Missing environment variables are reported
by name only; secret values are never echoed.

## Current scope

This is a PoC execution skeleton, not the final production runtime. Today it gives us:

- a readable Compose layout
- a complete worker env template
- a real polling loop structure
- object storage download/upload wrappers with Tencent COS legacy compatibility
- an internal OpenStoryline HTTP contract we can swap for the real engine later

It now bundles a trimmed `FireRed-OpenStoryline` source copy for server deployment
and adapter development. The Compose service default points at the real FireRed
adapter so an unset production environment does not silently render placeholder
videos. Local smoke runs remain explicit through `.env.example`, which sets
`OPENSTORYLINE_ENGINE_ADAPTER=skeleton`.
