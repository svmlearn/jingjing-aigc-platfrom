# 2026-05-19 Aliyun App Runtime Env Migration

## Scope

Batch 10G migrated only the Vercel app runtime environment whitelist needed by the Aliyun domestic app runtime.

Goal:

- Fix AI consultation falling back to "model key not configured".
- Do not copy the whole Vercel env.
- Do not overwrite Aliyun RDS/OSS runtime fields.
- Do not touch worker env, DNS, ICP, RDS public access, or OSS public access.

## Source and Target

Source:

- Vercel scope: `neveraloofwy-4960s-projects`
- Vercel project: `jingjing-content-platform-staging`
- Environment pulled: `production`

Target:

- ECS: `8.154.28.41`
- App env: `/srv/jingjing-domestic/shared/env/app.env`
- Backup before write: `/srv/jingjing-domestic/backups/app.env.before-batch10g-20260519T052905Z`
- Service restarted: `jingjing-domestic-app.service`

Temporary files:

- Full Vercel env pull was stored locally under `/tmp` only during filtering and then removed.
- Remote filtered allowlist temp file was removed after write.
- Remaining local status report contains only SET/MISSING states: `/tmp/jingjing-aliyun-app-runtime-migration-status.json`.

No secret values were printed, committed, or written to docs.

## Allowlist Result

Only non-empty allowed fields were written to Aliyun `app.env`.

| Field | Result |
|---|---|
| `SILICONFLOW_API_KEY` | SET |
| `LLM_API_KEY` | MISSING |
| `OPENAI_API_KEY` | MISSING |
| `DIFY_BASE_URL` | SET |
| `DIFY_API_KEY` | MISSING |
| `DIFY_WORKFLOW_RESPONSE_MODE` | SET |
| `DIFY_WORKFLOW_TIMEOUT_SECONDS` | SET |
| `APIFY_TOKEN` | MISSING |
| `TIKHUB_API_KEY` | MISSING |
| `TIKHUB_BASE_URL` | SET |

Vercel Production env pull returned empty values for `DIFY_API_KEY` and `TIKHUB_API_KEY`, so those fields were not migrated.

## Forbidden Fields

The migration script rejected keys outside the explicit allowlist. These old cloud/runtime fields were not migrated and were not used to overwrite Aliyun settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `APP_DATABASE_URL`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`

Existing Aliyun RDS/OSS app env remained the source for DB and storage:

- DB provider: `postgres`
- storage provider: `aliyun_oss`

## Restart and Health

Service restart:

- `jingjing-domestic-app.service`: active
- `nginx`: active

Health check after restart:

- `/api/health`: `ok=true`
- database provider: `postgres`
- storage provider: `aliyun_oss`
- bucket: `jingjing-domestic-phase1-hz`

## Consultation Verification

Browser page check:

- URL opened: `http://8.154.28.41/dashboard/consultation`
- Page loaded under QA account session.
- Page text did not contain the model-key-missing fallback.
- Existing/new consultation content showed assistant response text.

HTTP smoke using the same PM QA account:

- Report: `/tmp/jingjing-aliyun-app-runtime-consultation-http-smoke.json`
- Login status: `303`
- Login redirect host: `8.154.28.41`
- Session create status: `201`
- Message send status: `200`
- Processing status: `completed`
- Session ID: `3a383466-3877-4717-865b-12625664b106`
- Assistant message count: `2`
- Assistant reply non-empty: `true`
- Contains model-key-missing message: `false`

This confirms the consultation runtime no longer falls into the missing model key branch after `SILICONFLOW_API_KEY` migration.

## Dify and Content Calendar

Dify/content calendar smoke was not run because `DIFY_API_KEY` was MISSING after the Vercel production env pull.

TikHub/material import smoke was not run because `TIKHUB_API_KEY` was MISSING and `APIFY_TOKEN` was MISSING.

`DIFY_BASE_URL`, Dify response mode, Dify timeout, and `TIKHUB_BASE_URL` were migrated for later use, but they are not sufficient without the corresponding API keys.

## Notes

- `worker.env` was not changed.
- No DNS, ICP, RDS public access, or OSS public access changes were made.
- No main branch merge was performed.
- No phase completion marker was written.

