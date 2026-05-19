# 2026-05-18 Aliyun RDS / OSS Real Validation

## Scope

This run validated the real Hangzhou Aliyun resources without deploying app or worker:

- ECS base bootstrap
- ECS to RDS private connectivity
- RDS self-hosted migrations
- Aliyun OSS real server roundtrip
- Aliyun OSS signed PUT and CORS preflight

No DNS, ICP, RDS public access, OSS public ACL, main merge, completion marker, or app/worker deploy was performed.

## ECS Bootstrap

Target:

```text
ubuntu@8.154.28.41
private IP: 172.27.156.22
```

Result:

```text
ssh: ok
sudo -n true: ok
docker: Docker version 29.1.3
docker compose plugin: unavailable from current Ubuntu package source
docker-compose fallback: 1.29.2
nginx: nginx/1.18.0 (Ubuntu), active
psql: 14.22
docker service: active
/srv/jingjing-domestic/shared/env mode: 700
/srv/jingjing-domestic/shared/env/app.env mode: 600
```

The server env file was created from the local RDS validation env. No password or secret value was printed or committed.

## RDS Connectivity

Target:

```text
host: pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com
port: 5432
database: jingjing_domestic
user: jingjing_app
```

Private connectivity from ECS:

```text
pg_isready: accepting connections
```

SQL connectivity:

```text
PostgreSQL version: 18.3
current_database: jingjing_domestic
current_user: jingjing_app
```

Important note:

```text
APP_DATABASE_URL with sslmode=require failed because the RDS endpoint reported:
server does not support SSL, but SSL was required
```

Validation and migrations used the same URL with `sslmode=disable` in memory only. Before app deploy, update the server env to `sslmode=disable` or enable/confirm RDS SSL.

## Migrations

Applied from this worktree's `app/db/migrations/` on Aliyun RDS:

```text
202605130001_domestic_core_baseline.sql
202605160001_selfhost_p0_foundation.sql
202605160002_selfhost_pgvector_optional.sql
202605170001_selfhost_merchant_credits_usage.sql
202605170002_selfhost_storage_provider_aliyun_oss.sql
```

`pg_available_extensions` reported `vector` version `0.8.1.2`, but `jingjing_app` cannot create the extension. The optional pgvector migration exited successfully with fallback behavior and left `embedding_json` in place.

Post-migration checks:

```text
public base table count: 45
key tables: app_users, merchant_profiles, asset_objects, knowledge_documents, knowledge_chunks, merchant_credit_accounts
storage provider columns: asset_objects and knowledge_documents include storage_provider, bucket_name, storage_key
installed extensions: pgcrypto only
```

The main migration files are mostly `create table if not exists` / additive `alter table` style. The storage provider migration drops and recreates check constraints by name, so rerun is expected to be safe for that part. Do not rerun blindly on a populated production database without a backup.

## Aliyun OSS Roundtrip

Command:

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs \
  --env-file /tmp/jingjing-aliyun-oss-validation.env \
  --provider aliyun_oss \
  --roundtrip
```

Result:

```text
status: ok
provider: aliyun_oss
bucket: jingjing-domestic-phase1-hz
region: oss-cn-hangzhou
endpoint: oss-cn-hangzhou.aliyuncs.com
signedDownloadStatus: 200
signedDownloadMatched: true
deleted: true
```

No AccessKey ID or Secret was printed.

## Signed PUT Validation

Added focused smoke script:

```text
app/scripts/check-aliyun-oss-signed-put-smoke.mjs
```

It generates a signed PUT URL, checks CORS preflight, uploads a tiny text object with matching `Content-Type`, reads it back through a signed GET URL, and deletes the object.

Commands used:

```bash
node app/scripts/check-aliyun-oss-signed-put-smoke.mjs --env-file /tmp/jingjing-aliyun-oss-validation.env --origin http://127.0.0.1:3000
node app/scripts/check-aliyun-oss-signed-put-smoke.mjs --env-file /tmp/jingjing-aliyun-oss-validation.env --origin http://8.154.28.41
node app/scripts/check-aliyun-oss-signed-put-smoke.mjs --env-file /tmp/jingjing-aliyun-oss-validation.env --origin http://43.160.208.189
```

All three Origins passed:

```text
status: ok
preflightStatus: 200
preflightAllowMethods: GET, PUT, HEAD
preflightAllowHeaders: content-type
putStatus: 200
signedDownloadStatus: 200
signedDownloadMatched: true
deleted: true
```

## Gate Summary

```text
ECS base tools: passed, with docker-compose v1 fallback
RDS private connection: passed
RDS migrations: passed
Aliyun OSS server roundtrip: passed
Aliyun signed PUT: passed
app deploy: not performed; allowed after env sslmode correction and clean release prep
worker Batch 9C: app-side OSS gate passed; can be considered next
push: not performed
merge main: no
DOMESTIC_PHASE1_E2E_PASS: not written
long-task complete: not marked
```
