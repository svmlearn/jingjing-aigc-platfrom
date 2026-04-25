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

The worker assumes `video_edit_jobs.input_payload` can provide input assets like:

```json
{
  "input_assets": [
    {
      "asset_type": "video",
      "bucket_name": "jj-content-staging-1341668543",
      "storage_key": "draft-inputs/merchant-1/draft-1/demo.mp4",
      "file_name": "demo.mp4"
    }
  ]
}
```

The worker also derives output object keys from the staging task rules:

- `video-outputs/{merchantId}/{draftId}/{variantId}/{jobId}/final.mp4`
- `video-covers/{merchantId}/{draftId}/{variantId}/{jobId}/cover.jpg`
- `video-subtitles/{merchantId}/{draftId}/{variantId}/{jobId}/subtitles.srt`

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

## Current scope

This is a PoC execution skeleton, not the final production runtime. Today it gives us:

- a readable Compose layout
- a complete worker env template
- a real polling loop structure
- Tencent COS download/upload wrappers
- an internal OpenStoryline HTTP contract we can swap for the real engine later

It does not yet bundle the upstream `FireRed-OpenStoryline` project in this worktree. The current `openstoryline-engine` service is a local contract-preserving stub so the worker implementation can proceed independently.
