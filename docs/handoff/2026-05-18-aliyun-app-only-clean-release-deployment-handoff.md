# 2026-05-18 Aliyun App-Only Clean Release Deployment Handoff

## Current Goal

Batch 10A app-only clean release deployment to Aliyun ECS `8.154.28.41`.

Do not continue from this handoff by deploying worker / FireRed / OpenStoryline
/ TTS unless the next task explicitly asks for Batch 10B. Do not change DNS,
submit ICP, open RDS public access, make OSS public, merge main, write
`DOMESTIC_PHASE1_E2E_PASS`, or mark long-task complete.

## Branch / Worktree

```text
worktree: /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
deployed commit: 47f0345
release path: /srv/jingjing-domestic/releases/20260518233102-47f0345
current symlink: /srv/jingjing-domestic/current
```

`47f0345` was pushed to Gitee backup branch `codex/domestic-infra-migration`
before deployment.

## Completed

- Installed Node `v24.15.0` on ECS.
- Built the app in a clean archive release using `corepack pnpm@10.20.0`.
- Generated `/srv/jingjing-domestic/shared/env/app.env` from existing local
  RDS/OSS env files without printing values.
- Set `/srv/jingjing-domestic/shared/env` to `700` and `app.env` to `600`.
- Set Phase 1 RDS private-network temporary SSL stance to `sslmode=disable`.
- Created and started `jingjing-domestic-app.service`.
- Configured Nginx port 80 reverse proxy to `127.0.0.1:3000`.
- Verified `/api/health`, app preflight, RDS schema, Aliyun OSS roundtrip, and
  signed PUT.
- Ran app/business smoke suite.
- Confirmed no worker service is active.

## Validation Summary

Passed:

```text
app service: active
nginx: active
/api/health: ok
database provider: postgres
storage provider: aliyun_oss
OSS bucket: jingjing-domestic-phase1-hz
app preflight: ok
RDS public base table count: 45
OSS roundtrip: ok
signed PUT for http://8.154.28.41: ok
platform admin session smoke: ok
consultation / strategy smoke: ok
knowledge smoke: ok
agent admin writes smoke: ok
material library smoke: ok
import smoke: ok
merchant credits usage smoke: ok
```

Partial / deferred:

```text
video-chain API contract:
  app-generated signed PUT: 200
  media complete with aliyun_oss: 201
  video job create: 409
```

The 409 is expected until Batch 10B because current video job payload validation
still only accepts Tencent COS worker input assets. The existing repo smoke
script also still hardcodes Tencent COS for media complete, so Batch 10B should
update both the app/worker storage contract and the smoke script.

## Important Notes

RDS SSL:

```text
APP_DATABASE_SSL=disable
APP_DATABASE_URL sslmode=disable
```

This is temporary for Phase 1 private-network validation. Earlier validation
showed this RDS endpoint rejected `sslmode=require`. Reconfirm or enable RDS SSL
before production hardening.

Secrets:

```text
No password, AccessKey Secret, token, or cookie value was written to docs/chat/Git.
Only env file paths and field names were referenced.
```

## Server Paths

```text
releases: /srv/jingjing-domestic/releases
current: /srv/jingjing-domestic/current
env: /srv/jingjing-domestic/shared/env/app.env
logs: /srv/jingjing-domestic/logs/batch10a-20260518-2335
backups: /srv/jingjing-domestic/backups
systemd: /etc/systemd/system/jingjing-domestic-app.service
nginx: /etc/nginx/conf.d/jingjing-domestic.conf
```

## Changed Files

```text
docs/progress/2026-05-18-aliyun-app-only-clean-release-deployment.md
docs/handoff/2026-05-18-aliyun-app-only-clean-release-deployment-handoff.md
```

## Next Recommended Step

Batch 10B should focus on worker storage/app integration:

- Remove Tencent-COS-only assumptions from video job input payload validation.
- Decide whether worker consumes Aliyun OSS directly or through a storage
  abstraction.
- Update `check-domestic-video-chain-api-smoke.mjs` to use the configured
  provider instead of hardcoded `tencent_cos`.
- Only after the app contract passes, deploy worker and run render/final asset
  validation.

