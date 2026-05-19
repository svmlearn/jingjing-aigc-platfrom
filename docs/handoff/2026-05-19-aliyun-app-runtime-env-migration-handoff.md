# 2026-05-19 Aliyun App Runtime Env Migration Handoff

## Current Goal

Batch 10G migrated the Vercel app runtime env whitelist into Aliyun `/srv/jingjing-domestic/shared/env/app.env` to restore the AI consultation model key runtime without copying old Supabase/Vercel/COS deployment fields.

## Status

Completed.

No app/worker code was changed. Only Aliyun `app.env` was updated, and only allowed non-empty fields were written.

## Source and Target

Source:

- Vercel scope: `neveraloofwy-4960s-projects`
- Vercel project: `jingjing-content-platform-staging`
- Environment: `production`

Target:

- ECS: `8.154.28.41`
- App env: `/srv/jingjing-domestic/shared/env/app.env`
- Backup: `/srv/jingjing-domestic/backups/app.env.before-batch10g-20260519T052905Z`
- Service restarted: `jingjing-domestic-app.service`

## Migrated Field State

| Field | State |
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

`DIFY_API_KEY` and `TIKHUB_API_KEY` were present by name in Vercel metadata, but the production env pull returned empty values. They were treated as MISSING and were not written to Aliyun.

## Protected Fields

The migration did not migrate or overwrite:

- Supabase fields
- Vercel deployment metadata fields
- old Tencent COS fields
- `DATABASE_URL`
- `APP_DATABASE_URL`
- existing Aliyun RDS/OSS fields

`worker.env` was not changed.

## Verification

Runtime:

- `jingjing-domestic-app.service`: active
- `nginx`: active
- `/api/health`: `ok=true`
- database provider: `postgres`
- storage provider: `aliyun_oss`

Consultation:

- Browser opened `http://8.154.28.41/dashboard/consultation` under the QA account session.
- Page text did not contain the model-key-missing fallback.
- API smoke report: `/tmp/jingjing-aliyun-app-runtime-consultation-http-smoke.json`
- Session ID: `3a383466-3877-4717-865b-12625664b106`
- Session create: `201`
- Message send: `200`
- Processing: `completed`
- Assistant reply non-empty: true
- Missing model key message: false

Dify and content calendar:

- Dify smoke skipped because `DIFY_API_KEY` is MISSING.
- TikHub/material smoke skipped because `TIKHUB_API_KEY` is MISSING.
- Apify smoke skipped because `APIFY_TOKEN` is MISSING.

## Rollback

Rollback app env:

```bash
sudo cp /srv/jingjing-domestic/backups/app.env.before-batch10g-20260519T052905Z /srv/jingjing-domestic/shared/env/app.env
sudo chmod 600 /srv/jingjing-domestic/shared/env/app.env
sudo systemctl restart jingjing-domestic-app.service
curl -fsS http://127.0.0.1/api/health
```

## Guardrails Preserved

- No DNS/ICP/HTTPS changes.
- No RDS public access changes.
- No OSS public access changes.
- No worker env changes.
- No main branch merge.
- No phase completion marker.
- No secret values printed or committed.

## Next Step

If Dify/content calendar real smoke is required, the user needs to restore or provide `DIFY_API_KEY` through a safe channel. If TikHub/material import smoke is required, restore or provide `TIKHUB_API_KEY`; Apify import requires `APIFY_TOKEN`.
