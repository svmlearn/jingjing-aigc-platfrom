# 2026-05-14 server purchase and domestic migration zero-memory handoff

## 1. Purpose

This handoff lets a new Codex window continue two related threads without relying on chat history:

1. Cloud resource purchase decision for the app's next verification environment.
2. Domestic infrastructure migration branch/worktree status.

Current user goal:

```text
First decide whether the next verification environment should be mainland China or Hong Kong.
Then decide Tencent Cloud vs Alibaba Cloud.
Then buy server + object storage + PostgreSQL.
Then resume the domestic-infra-migration worktree for real-resource validation.
```

## 2. Main Repo State

Main repo:

```text
/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台
```

Current branch:

```text
main
```

Latest relevant commits before this handoff:

```text
af44893 docs: add dify siliconflow v32 test results
63ddd3e docs: add hong kong deployment decision notes
c5e0ace docs: add domestic server purchase comparison
```

At the time this handoff was written, `git status --short` in main was clean.

Important main-branch docs for the next window:

```text
docs/handoff/2026-05-14-国内云服务器采购配置与对比.md
docs/handoff/2026-05-13-国内化代码改造与迁移计划表.md
docs/handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md
```

## 3. Cloud Purchase Decision Status

The team has not yet decided between mainland China and Hong Kong deployment.

The current decision sequence should be:

```text
1. Decide mainland China vs Hong Kong.
2. Decide Tencent Cloud vs Alibaba Cloud.
3. Buy matching server + object storage + PostgreSQL from the same cloud/region family.
4. Only then resume real-resource validation in the domestic migration worktree.
```

Do not jump directly into purchase if the domain/company-subject question is still unanswered.

## 4. Domain / ICP / Company Subject Questions

Open decision for tomorrow:

```text
Domain: ba-ba-ke.com
Unknown: whether it is already held / real-name-authenticated under the boss's Hong Kong company.
Unknown: whether it can be transferred or real-name-authenticated under a mainland China company.
Known: there is likely a legitimate mainland company that can do ICP filing if a suitable domain is available.
```

Tomorrow the user will provide a conclusion. Ask/record:

1. Is `ba-ba-ke.com` currently under a Hong Kong company?
2. Can `ba-ba-ke.com` be moved to a mainland company subject?
3. If it cannot be moved, is the user willing to buy a new domain for mainland ICP?
4. Can the mainland company also own the cloud account, domain real-name auth, ICP filing, server, object storage, and database?

Decision rules:

| Condition | Preferred route |
| --- | --- |
| Mainland company can own/real-name-auth a domain and do ICP | Mainland China server + mainland object storage + mainland PostgreSQL |
| `ba-ba-ke.com` is stuck under Hong Kong company and user does not want a new domain | Hong Kong server + Hong Kong object storage + Hong Kong PostgreSQL |
| User only wants phase1 technical validation | IP-based test is OK before ICP/HTTPS/domain finalization |
| User wants stable long-term usage by mainland real-estate agents | Prefer mainland China route if ICP is feasible |

## 5. Mainland Route Summary

Use this if a mainland company/domain/ICP path is feasible.

Recommended shape:

```text
Mainland company cloud account
-> Mainland server
-> Mainland PostgreSQL
-> Mainland COS/OSS bucket
-> ICP-filed domain
-> HTTPS
-> PWA for member/intermediary users
```

Key points:

- For phase1 validation, IP access is enough: `http://<server-ip>`.
- For production PWA, use `https://<domain>`.
- PWA needs HTTPS for reliable Service Worker behavior; ICP is not the PWA requirement, but mainland hosting requires ICP.
- ICP should use consistent subject information: cloud account real-name subject, domain holder, ICP subject, and business owner should align.
- If using mainland China for web access, the server duration may need to be 3 months or longer for ICP filing.

Mainland server purchase configs already documented:

```text
docs/handoff/2026-05-14-国内云服务器采购配置与对比.md
```

Currently recorded mainland options:

| Cloud | Server | Region | System | Disk | Network | Price shown |
| --- | --- | --- | --- | --- | --- | ---: |
| Tencent Cloud | CVM `C6.2XLARGE16`, 8C16G | Shanghai | Ubuntu 22.04 | 100 GiB | traffic billing, 5 Mbps | `¥980.00` + `¥0.80/GB` |
| Alibaba Cloud | ECS `ecs.c9i.2xlarge`, 8C16G | Hangzhou | Ubuntu 22.04 | 100 GiB | pay by traffic, 5 Mbps | `¥793.64` + traffic |

Current mainland cloud preference:

- If using Tencent COS / Tencent PostgreSQL, Tencent Cloud is operationally simpler.
- If starting fresh and prioritizing compute price, Alibaba Cloud is cheaper.
- Do not mix server on one cloud, object storage on another, and database on a third unless there is a strong reason.

## 6. Hong Kong Route Summary

Use this if `ba-ba-ke.com` is stuck under a Hong Kong company and the user wants fast trial operation without mainland ICP.

Recommended shape:

```text
Hong Kong server
-> Hong Kong PostgreSQL
-> Hong Kong COS/OSS bucket
-> HTTPS on ba-ba-ke.com
-> PWA for mainland users
```

Known availability:

| Cloud | Server | Object storage | PostgreSQL | Notes |
| --- | --- | --- | --- | --- |
| Tencent Cloud | Hong Kong CVM, `ap-hongkong` | Hong Kong COS bucket | Hong Kong TencentDB for PostgreSQL | Current code is already closer to COS |
| Alibaba Cloud | Hong Kong ECS, `cn-hongkong` | Hong Kong OSS bucket, endpoint `oss-cn-hongkong.aliyuncs.com` | Hong Kong RDS PostgreSQL | Good fresh-start option |

Hong Kong route boundaries:

- Hong Kong deployment usually does not require mainland ICP if web access and object storage are outside mainland China.
- Mainland users can access Hong Kong HTTPS/PWA, but uploads/downloads may be slower or less stable because the link is cross-border.
- Hong Kong does not solve mainland CDN acceleration. If using mainland CDN nodes, mainland ICP usually comes back into scope.
- Do not mix Hong Kong server with mainland object storage/CDN if the goal is to avoid ICP complexity.

Current Hong Kong recommendation:

- If continuing from the current COS implementation, choose Tencent Cloud Hong Kong for less code/storage-adapter friction.
- If starting fresh and willing to adapt OSS, Alibaba Cloud Hong Kong is also viable.

## 7. Domestic Migration Worktree Status

Do not continue the real e2e yet. The migration branch is paused at a resource-blocked checkpoint.

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Latest commit:

```text
cdc5ca1 docs: add domestic offline deployment readiness kit
```

Verified status:

```text
git status --short
# clean
```

Long-task state:

```text
.codex/long-task/active.json
status: blocked
taskId: domestic-infra-migration
completionPromise: DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

Do not mark the project long-task complete yet.

Do not do any of these before real resources exist:

```text
Do not merge.
Do not push.
Do not switch ba-ba-ke.com.
Do not do ICP changes.
Do not write DOMESTIC_PHASE1_E2E_PASS.
Do not mark project long-task complete.
Do not claim domestic phase1 e2e passed.
```

## 8. What The Migration Branch Already Did

The worker in the other context reported:

```text
Completed resource-independent / offline hardening.
Branch: codex/domestic-infra-migration
Latest commit: cdc5ca1 docs: add domestic offline deployment readiness kit
git status --short: clean
project long-task: still blocked, not complete
No merge, no push, no ba-ba-ke.com switch, no ICP, no completion marker.
```

Key updated/created files in the worktree:

```text
deploy/domestic/README.md
docs/handoff/2026-05-14-domestic-resource-readiness-checklist.md
docs/progress/2026-05-14-domestic-resource-independent-hardening.md
docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
docs/handoff/2026-05-13-domestic-infra-migration-phase-a0-a6-handoff.md
```

Reported local validations passed:

```text
pnpm typecheck
pnpm lint
pnpm build
worker 50 tests OK
worker compileall
Docker compose config
deployment template checks
app/COS/API/worker missing-env failure paths
PostgreSQL baseline/seed local validation
local login
test draft
media complete
video job create
source item read API
mixed Supabase/Postgres env priority
app env preflight
API smoke
worker env-file smoke
```

Still blocked because these do not exist yet:

```text
Domestic or Hong Kong target server
Target PostgreSQL
Target COS/OSS bucket and CORS
Mobile browser/IP verification environment
Real provider keys/test account/env files
```

## 9. When Resources Are Ready

The user will return with some or all of:

```text
Server IP
Server SSH user / login method
Server region
PostgreSQL connection string
PostgreSQL SSL mode
COS/OSS bucket
COS/OSS region
COS/OSS CORS origin
Secret ID / key, only in local env, never committed
Test owner email
Temporary password
Provider keys
Mobile test device/browser
```

Do not paste secrets into committed docs.

Then resume from:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-14-domestic-resource-readiness-checklist.md
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration/docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
```

First commands after resources exist:

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
node app/scripts/check-domestic-app-env.mjs --env-file /etc/jingjing/app.env --require-video-chain-test-entrypoint
node app/scripts/check-domestic-cos-roundtrip.mjs --env-file /etc/jingjing/app.env
```

Then continue server bootstrap, app smoke, worker smoke, and only then real mobile e2e.

Real pass criteria:

```text
Mobile browser opens target IP/domain.
User can log in.
User can create/upload material.
Bytes land in target COS/OSS.
API creates video job.
Worker picks the job.
OpenStoryline/FireRed returns success.
final.mp4, cover, subtitles upload to target COS/OSS.
DB records succeeded job and asset_objects.
Page can re-sign and download final.mp4 from target object storage.
Evidence is recorded in progress docs.
```

Only after that may the project move toward completion marker / long-task complete.

## 10. Suggested First Message In New Window

The user can paste this to a new Codex window:

```text
Continue from docs/handoff/2026-05-14-server-purchase-domestic-migration-zero-memory-handoff.md.

We are deciding the next server/resource route for the project and then resuming the domestic-infra-migration worktree.

First help me decide:
1. Mainland China vs Hong Kong deployment, based on ba-ba-ke.com domain subject and whether we can use a mainland company/domain for ICP.
2. Tencent Cloud vs Alibaba Cloud after that route is chosen.

Do not touch /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration until I explicitly say resources are ready or ask you to inspect it.

That worktree should remain:
branch codex/domestic-infra-migration
commit cdc5ca1 docs: add domestic offline deployment readiness kit
git status clean
long-task blocked, not complete

No merge, no push, no ba-ba-ke.com switch, no ICP, no DOMESTIC_PHASE1_E2E_PASS until real resources and real mobile e2e pass.
```
