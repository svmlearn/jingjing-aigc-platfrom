# 2026-05-25 Phase 3L Worker COS Removal

## Scope

Phase 3L only cleaned the video worker runtime. It did not change app-side contracts, app DB columns, app storage provider enums, `cosKey` compatibility fields, `app/supabase/migrations`, deployment, or main-branch state.

## Changes

- Removed worker-side Tencent COS runtime support and kept `WORKER_STORAGE_PROVIDER` constrained to `aliyun_oss`.
- Removed `WORKER_COS_*`, shared `COS_*`, `WORKER_COS_RESULT_PREFIX`, and Tencent COS wording from worker env examples, Docker Compose, README, runtime config, and real I/O smoke checks.
- Renamed `worker/app/cos_client.py` to `worker/app/object_storage_client.py`.
- Removed `qcloud_cos` runtime usage and `cos-python-sdk-v5` from `workers/video-worker/worker/requirements.txt`.
- Renamed internal processor/main wiring from `cos_client` / `_cos_client` to `storage_client` / `_storage_client`.
- Updated worker tests and fixtures to use `aliyun_oss` only.
- Changed the FireRed voiceover contract fixture from `cos://...` to `oss://...`; this test only verifies the wrapper passes through a reference string, and the current worker prepares real voice profile audio as a local file before invoking OpenStoryline.

## Preserved

- Worker still uses the object storage abstraction name `ObjectStorageClient`.
- Output uploads still write generated video, cover, and subtitle artifacts through object storage and persist `asset_objects`.
- App-side legacy field names and DB columns such as `cos_key`, `source_cos_key`, and `thumb_cos_key` remain untouched for separate cleanup.
- Vendor code under `workers/video-worker/openstoryline/**` was not modified.

## Validation

- `python3 -m py_compile workers/video-worker/worker/app/config.py workers/video-worker/worker/app/models.py workers/video-worker/worker/app/main.py workers/video-worker/worker/app/processor.py workers/video-worker/worker/app/real_io_smoke.py workers/video-worker/worker/app/object_storage_client.py` passed.
- Host Python did not have `pytest`, so a temporary venv was used with `pytest` and `requests` installed for the requested test command.
- `python3 -m pytest workers/video-worker/tests/test_real_io_smoke.py workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_client.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py` passed in the temp venv: 48 passed.
- `rg -n -S "tencent_cos|WORKER_COS|COS_SECRET|COS_BUCKET|COS_REGION|Tencent COS|cos://|cos_client" workers/video-worker --glob '!workers/video-worker/openstoryline/**'` returned no matches.

## Remaining Items

- Worker-side `openstoryline/**` vendor history was not rewritten.
- App-side contract/DB legacy names are intentionally left for later batches.
- No push, deploy, merge, or main-worktree changes were performed.
