# Video Worker

`workers/video-worker/` is the staging-only execution skeleton for the current four-layer media architecture:

- `Vercel`: frontend and business APIs
- `Supabase`: database and job source of truth
- `Tencent COS`: source and generated media storage
- `Tencent Lighthouse`: private worker runtime for video execution

This directory intentionally owns only the worker-side responsibilities. It does not expose any public OpenStoryline endpoint and it does not depend on Next.js routes or Supabase migrations living elsewhere in the repo.

## Services

`docker-compose.yml` defines exactly two internal services:

- `openstoryline-engine`
- `video-worker`

`openstoryline-engine` is a local HTTP skeleton that stands in for the real OpenStoryline runtime. It keeps the contract shape stable for this worktree and stays reachable only on the private Docker network.

The service now has an explicit engine adapter boundary:

- `OPENSTORYLINE_ENGINE_ADAPTER=skeleton` keeps the current contract-preserving placeholder runtime.
- `OPENSTORYLINE_ENGINE_ADAPTER=fire_red` is reserved for the full FireRed integration and fails closed with HTTP 501 until the session/chat/output mapping is implemented.
- `FIRERED_OPENSTORYLINE_BASE_URL`, `FIRERED_RUN_TIMEOUT_SECONDS`, and `FIRERED_PROVIDER_KEY` are server-only preflight settings for that future adapter; health checks expose only whether the provider key is configured, never the key value.

This is deliberate. The worker owns a synchronous `/v1/runs` job contract, while the full FireRed project is a session/chat/WebSocket style application. Do not replace the current `openstoryline/` directory with FireRed source directly; add a real adapter when that mapping is ready.

`video-worker` is the polling worker. It:

1. sweeps stale jobs on boot and before each polling pass
2. claims only the oldest `pending` job
3. downloads input media from Tencent COS
4. calls the local `openstoryline-engine`
5. uploads generated outputs back to Tencent COS
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
      "storage_provider": "tencent_cos",
      "bucket_name": "jj-content-staging-1341668543",
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
`failed_manual` contract errors before COS download. If `storage_provider` is
present, it must be `tencent_cos`; unsupported providers are rejected before COS
download. If `bucket_name` is present, it must be a non-empty string; otherwise
the worker uses its configured default COS bucket.

`productionDirective` is intentionally lightweight in this stage. It records the
parts of the upstream content decision that the worker and engine must not
silently rewrite. The worker currently normalizes it into an internal directive
and forwards the normalized directive to `openstoryline-engine`.

The worker also derives output object keys from the staging task rules:

- `video-outputs/{merchantId}/{draftId}/{variantId}/{jobId}/final.mp4`
- `video-covers/{merchantId}/{draftId}/{variantId}/{jobId}/cover.jpg`
- `video-subtitles/{merchantId}/{draftId}/{variantId}/{jobId}/subtitles.srt`

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

- COS download failures
- temporary engine failures
- missing files in requested engine outputs
- upload failures
- worker runtime exceptions

Download, engine, and upload failures are recorded with stage-specific
diagnostics: `downloading_inputs_failed` for COS input download failures,
`openstoryline_rendering_failed` for engine invocation failures, and
`uploading_outputs_failed` for generated output upload failures. If generated
files upload but `asset_objects` cannot be persisted, the job is marked
`asset_objects_persistence_failed` with `asset_objects_insert_failed` in the
failure reason. Engine invocation failures include `engine_run_failed` in the
failure reason.

The normalized directive is also written into the engine request so the skeleton
engine and future real OpenStoryline adapter share the same contract surface.
After engine execution, the worker checks the requested output files before any
COS upload. Successful jobs include `engine_adapter`, storage-key `outputs`, and
persisted `asset_objects.id` values in `result_payload.uploaded_assets`.
Only requested `desiredOutputs` are uploaded and written back; for example,
`["final_video"]` ignores any cover or subtitle files produced by the engine.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in `SUPABASE_DB_URL`, `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_BUCKET`, `OPENAI_API_KEY`, and any extra provider keys you need.
3. Make sure the host directories exist on the worker machine:

```bash
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs}
```

4. Start the stack:

```bash
docker compose up --build
```

To verify real staging dependencies without printing secrets, run:

```powershell
$env:PYTHONPATH='D:\codexplan\worktrees\jingjing-content-platform-worker\workers\video-worker'
python -m worker.app.real_io_smoke
```

The smoke requires `SUPABASE_DB_URL`, `COS_SECRET_ID`, `COS_SECRET_KEY`,
`COS_BUCKET`, and `COS_REGION`. It performs a read-only database check for
`video_edit_jobs` and `asset_objects`, then uploads, downloads, verifies, and
deletes one small object under `worker-real-smoke/` in Tencent COS. Missing
environment variables are reported by name only; secret values are never echoed.

## Current scope

This is a PoC execution skeleton, not the final production runtime. Today it gives us:

- a readable Compose layout
- a complete worker env template
- a real polling loop structure
- Tencent COS download/upload wrappers
- an internal OpenStoryline HTTP contract we can swap for the real engine later

It does not yet bundle the upstream `FireRed-OpenStoryline` project in this worktree. The current `openstoryline-engine` service is a local contract-preserving stub so the worker implementation can proceed independently.
