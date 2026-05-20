# 2026-05-18 Aliyun ECS/RDS/OSS Validation Task

## 1. Goal

Continue after Aliyun cloud resources were purchased and wired.

This task initializes the final Aliyun ECS enough to validate:

```text
ECS base environment
ECS -> RDS PostgreSQL private network connectivity
RDS schema migrations
Aliyun OSS real roundtrip
Aliyun OSS signed PUT validation
```

Do not deploy the production app/worker yet unless the user explicitly confirms after these validations pass.

## 2. Current Known Resources

ECS:

```text
instance id: i-bp190gb0a3ajywl6urzk
public IP: 8.154.28.41
private IP: 172.27.156.22
region/zone: cn-hangzhou / cn-hangzhou-k
VPC: vpc-bp15fcpbsrgzp9zs5hxx2
vSwitch: vsw-bp1laydq1pucnxugyr54i
security group: sg-bp1hnbjy7dqbhesc4g2f
OS: Ubuntu 22.04 64-bit
spec: ecs.c9i.2xlarge, 8 vCPU / 16 GiB
bandwidth: fixed 5 Mbps
```

RDS:

```text
instance id: pgm-bp1p28yc1u41re78
host: pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com
port: 5432
database: jingjing_domestic
user: jingjing_app
VPC: vpc-bp15fcpbsrgzp9zs5hxx2
whitelist: includes 172.27.156.22
public access: off
```

OSS:

```text
bucket: jingjing-domestic-phase1-hz
region: oss-cn-hangzhou
public endpoint: oss-cn-hangzhou.aliyuncs.com
internal endpoint: oss-cn-hangzhou-internal.aliyuncs.com
ACL: private
block public access: enabled
CORS: configured for PUT/GET/HEAD
RAM user: jingjing-domestic-oss-phase1
policy: jingjing-domestic-phase1-oss-prefix-policy
```

## 3. Must-Read Context

Read:

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/progress/2026-05-18-aliyun-domestic-resource-bootstrap.md
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/handoff/2026-05-18-aliyun-domestic-server-bootstrap-zero-memory-handoff.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-18-storage-provider-aliyun-oss-sdk-handoff.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md
```

Then in the migration worktree check:

```bash
cd /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
git status --short --branch
git log --oneline --decorate -8
```

Do not merge `main`.

## 4. Secret Handling Rules

Never write these to chat, docs, git, shell history logs, or final replies:

```text
ECS password / SSH private key
RDS password
ALIYUN_OSS_ACCESS_KEY_ID full value
ALIYUN_OSS_ACCESS_KEY_SECRET
cookies / tokens / verification codes
```

The user must create and save the RAM AccessKey Secret personally.

Recommended local-only env files:

```text
/tmp/jingjing-aliyun-oss-validation.env
/tmp/jingjing-aliyun-rds-validation.env
```

Recommended server env path:

```text
/srv/jingjing-domestic/shared/env/app.env
```

File permissions:

```bash
chmod 600 /tmp/jingjing-aliyun-oss-validation.env /tmp/jingjing-aliyun-rds-validation.env
sudo chmod 700 /srv/jingjing-domestic/shared/env
sudo chmod 600 /srv/jingjing-domestic/shared/env/*.env
```

If an env file is missing, stop and ask the user to create/fill it locally. Do not ask the user to paste secrets into chat.

## 5. User Pre-Step: Create OSS AccessKey

Before OSS validation, the user must create one AccessKey for RAM user:

```text
jingjing-domestic-oss-phase1
```

The user should save it only into `/tmp/jingjing-aliyun-oss-validation.env` or a secure password manager.

Env template:

```bash
STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_ACCESS_KEY_ID=<secret, do not print>
ALIYUN_OSS_ACCESS_KEY_SECRET=<secret, do not print>
ALIYUN_OSS_BUCKET=jingjing-domestic-phase1-hz
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

For RDS:

```bash
APP_DATABASE_URL=postgres://jingjing_app:<password>@pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com:5432/jingjing_domestic?sslmode=require
DATABASE_PROVIDER=postgres
```

The password must be filled by the user or stored in a local env file, never in docs/chat.

## 6. Step A: ECS Base Bootstrap

SSH to the final ECS:

```bash
ssh ubuntu@8.154.28.41
```

If password input is required, the user should type it interactively. Do not record it.

Install base packages:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq unzip nginx postgresql-client
```

Install Docker and Docker Compose plugin using a stable Ubuntu-compatible path. Prefer official Docker packages if available; `docker.io` is acceptable for initial validation if the official repo setup would slow the task.

Create directories:

```bash
sudo mkdir -p /srv/jingjing-domestic/releases
sudo mkdir -p /srv/jingjing-domestic/shared/env
sudo mkdir -p /srv/jingjing-domestic/logs
sudo mkdir -p /srv/jingjing-domestic/backups
sudo chmod 700 /srv/jingjing-domestic/shared/env
```

Verify:

```bash
docker --version
docker compose version
nginx -v
psql --version
systemctl is-active docker
systemctl is-active nginx
```

## 7. Step B: RDS Connectivity From ECS

From ECS, verify private network connectivity:

```bash
pg_isready -h pgm-bp1p28yc1u41re78.pg.rds.aliyuncs.com -p 5432 -U jingjing_app -d jingjing_domestic
```

Then verify SQL with the secret-safe env. Example:

```bash
set -a
. /srv/jingjing-domestic/shared/env/app.env
set +a
psql "$APP_DATABASE_URL" -c "select version();"
```

Do not echo `APP_DATABASE_URL`.

## 8. Step C: RDS Migrations

Apply migrations only after RDS connectivity passes.

Use the migration worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Read:

```text
app/db/README.md
app/db/migrations/
```

Apply the self-hosted migration sequence to Aliyun RDS:

```text
202605130001_domestic_core_baseline.sql
202605160001_selfhost_p0_foundation.sql
202605170001_selfhost_merchant_credits_usage.sql
202605170002_selfhost_storage_provider_aliyun_oss.sql
```

Check pgvector separately before optional migration:

```sql
select version();
select * from pg_available_extensions where name = 'vector';
```

Do not apply optional pgvector migration unless the extension is available and the branch docs say it is safe for this environment.

Record:

```text
target DB
commands used
migrations applied
table count / key table checks
whether rerun is safe
```

## 9. Step D: Aliyun OSS Real Validation

From local migration worktree, run:

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs \
  --env-file /tmp/jingjing-aliyun-oss-validation.env \
  --provider aliyun_oss \
  --roundtrip
```

Expected:

```text
status=ok
provider=aliyun_oss
signedDownloadStatus=200
signedDownloadMatched=true
deleted=true
```

Then run signed PUT validation. Inspect current scripts first:

```bash
rg -n "signed PUT|uploadUrl|aliyun_oss" app/scripts app/src/server/storage app/src/lib/ui/video-workflow.ts
```

If an existing script covers signed PUT, use it. If not, add a small focused smoke script in the migration worktree and commit it there. The smoke must:

```text
generate signed PUT upload intent
PUT a tiny text file with Content-Type
read back through signed URL
delete object
avoid printing secrets
```

## 10. Step E: Documentation

Update main repo progress:

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/progress/2026-05-18-aliyun-domestic-resource-bootstrap.md
```

If code or validation scripts are changed in migration worktree, also add:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/progress/2026-05-18-aliyun-rds-oss-real-validation.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-18-aliyun-rds-oss-real-validation-handoff.md
```

Record:

```text
ECS base bootstrap result
RDS connectivity result
RDS migration result
OSS roundtrip result
signed PUT result
what remains pending
whether app deploy is now allowed
whether worker Batch 9C is now allowed
push/merge state
```

## 11. Stop Conditions

Stop and report if:

```text
SSH cannot connect
RDS password/env is missing
RDS private connectivity fails after whitelist update
OSS AccessKey/env is missing
OSS roundtrip fails due to permissions/CORS/endpoint
migration fails
```

Do not work around by:

```text
opening RDS public access
making OSS bucket public
printing or committing secrets
merging main
writing DOMESTIC_PHASE1_E2E_PASS
marking long-task complete
deploying worker storage Batch 9C before OSS signed PUT passes
```

## 12. Completion Conditions

Complete this task only when:

```text
ECS base tools installed and verified
RDS private connection verified
RDS migrations applied or precise blocker recorded
Aliyun OSS roundtrip passed or precise blocker recorded
Aliyun signed PUT passed or precise blocker recorded
docs updated
no secrets leaked
no main merge
no completion marker
```

