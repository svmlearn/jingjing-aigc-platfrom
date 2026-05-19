# 2026-05-18 Aliyun RDS / OSS Real Validation Handoff

## Goal

Validate the real Aliyun domestic infrastructure before any app / worker deployment:

- ECS base environment
- RDS private connectivity and migrations
- Aliyun OSS server roundtrip
- Aliyun OSS signed PUT upload path

## Branch / Worktree

```text
worktree: /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
starting HEAD: 0c7c9af Batch 9B-V record Aliyun OSS validation blocker
```

## Completed

- Bootstrapped ECS `ubuntu@8.154.28.41` with base packages and `/srv/jingjing-domestic` directories.
- Verified Docker, docker-compose fallback, Nginx, psql, Docker service, Nginx service.
- Copied RDS validation env to `/srv/jingjing-domestic/shared/env/app.env` with mode `600` without printing secrets.
- Verified ECS to RDS private network connectivity.
- Verified SQL connection using `sslmode=disable` because RDS rejected `sslmode=require`.
- Applied self-hosted migrations to Aliyun RDS.
- Confirmed pgvector is available but cannot be created by the business user, so optional migration safely fell back.
- Ran real Aliyun OSS put / signed GET / delete roundtrip.
- Added and ran signed PUT smoke for three configured Origins.

## Changed Files

```text
app/scripts/check-aliyun-oss-signed-put-smoke.mjs
docs/progress/2026-05-18-aliyun-rds-oss-real-validation.md
docs/handoff/2026-05-18-aliyun-rds-oss-real-validation-handoff.md
```

## Validation Results

ECS:

```text
ssh: ok
sudo -n true: ok
docker: Docker version 29.1.3
docker-compose: 1.29.2 fallback
nginx: active
docker: active
psql: 14.22
```

RDS:

```text
pg_isready: accepting connections
PostgreSQL: 18.3
database/user: jingjing_domestic / jingjing_app
migrations applied: baseline, foundation, pgvector optional fallback, merchant credits, Aliyun OSS storage provider
public table count: 45
```

OSS:

```text
server roundtrip: passed
signed PUT: passed
validated Origins:
- http://127.0.0.1:3000
- http://8.154.28.41
- http://43.160.208.189
cleanup: all smoke objects deleted
```

## Important Follow-Up

The RDS env currently supplied with `sslmode=require` does not work against this RDS endpoint:

```text
server does not support SSL, but SSL was required
```

Before app deployment, update the server env to `sslmode=disable` or enable/confirm RDS SSL. No password value was printed or recorded.

## Not Done

- No app deployment.
- No worker deployment or Batch 9C implementation.
- No DNS changes.
- No ICP submission.
- No RDS public access.
- No OSS public ACL change.
- No AccessKey Secret printing.
- No main merge.
- No `DOMESTIC_PHASE1_E2E_PASS`.
- No long-task completion mark.

## Next Recommended Step

Prepare a clean release deploy plan for the app using the real Aliyun RDS/OSS env, after correcting `sslmode`. Worker storage Batch 9C can now be planned because the app-side Aliyun OSS roundtrip and signed PUT gate passed.
