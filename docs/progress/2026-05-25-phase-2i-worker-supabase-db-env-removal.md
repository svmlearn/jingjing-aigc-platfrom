# Phase 2I Worker Database Env Cleanup

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Remove the video worker's legacy `SUPABASE_DB_URL` compatibility fallback. Worker database access now uses only `WORKER_DATABASE_URL` for PostgreSQL.

## Changes

- `workers/video-worker/worker/app/config.py`
  - Removed the `SUPABASE_DB_URL` fallback.
  - Updated the missing database error to name only `WORKER_DATABASE_URL` and PostgreSQL worker mode.
- `workers/video-worker/worker/app/real_io_smoke.py`
  - Removed the `SUPABASE_DB_URL` fallback from `RealSmokeConfig.from_env()`.
- `workers/video-worker/tests/test_real_io_smoke.py`
  - Replaced the compatibility fallback test with a contract check that `WORKER_DATABASE_URL` is the only database env accepted by the smoke config.
  - Added a local test-path bootstrap so the test can be collected from the repository root.
- `workers/video-worker/.env.example`
  - Removed `SUPABASE_DB_URL` and updated the database comment to the current PostgreSQL/`WORKER_DATABASE_URL` wording.
- `workers/video-worker/firered.env.example`
  - Removed the legacy `SUPABASE_DB_URL` example.
- `workers/video-worker/docker-compose.yml`
  - Removed the `SUPABASE_DB_URL` environment pass-through.

## Deliberately Left Alone

- Storage provider compatibility values such as `supabase_storage`, `tencent_cos`, COS, and OSS are not handled in this batch.
- App package files, app storage contracts, and worker storage implementation files were not touched.

## Validation

Passed:

```bash
python3 -m py_compile workers/video-worker/worker/app/config.py workers/video-worker/worker/app/real_io_smoke.py
pytest workers/video-worker/tests/test_real_io_smoke.py
python3 -m pytest workers/video-worker/tests/test_real_io_smoke.py
rg -n -S "SUPABASE_DB_URL|Supabase|supabase" workers/video-worker --glob '!openstoryline/**'
git diff --check
```

Notes:

- The host Homebrew `python3` did not have `pytest` installed and refused direct user install because the environment is externally managed. The `python3 -m pytest ...` validation was therefore run inside a temporary venv created from the same `python3`; it passed with 10 tests.
- The final `rg` returned no matches.
