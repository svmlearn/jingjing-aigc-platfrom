# 2026-05-20 member BGM default release handoff

## Goal

Make member-side video edits enable BGM by default, push to Gitee `孟_5.13`, then deploy through the normal server release flow.

## Completed

- Updated `app/src/components/member/member-workspace.tsx`.
- Set `bgm.enabled=true` in both member production config paths:
  - voice profile path
  - system voiceover fallback path
- Created commit `073a38e fix: enable member video bgm by default`.
- Pushed commit to Gitee branch `孟_5.13`.

## Validation

Passed:

```text
corepack pnpm typecheck
git diff --check
git ls-remote gitee refs/heads/孟_5.13
```

Not run:

```text
corepack pnpm test -- video-job-payload.test.ts
```

Reason: no `test` script exists in `app/package.json`.

## Earlier Blocker

Server release deployment did not run because SSH authentication to ECS failed.

Observed failures:

```text
ubuntu@8.154.28.41: Permission denied (publickey).
root@8.154.28.41: Permission denied (publickey).
```

Tried local identities:

```text
~/.ssh/id_rsa
~/.ssh/id_ed25519
```

No server files, env files, DNS, ICP, RDS, OSS permissions, worker prefix, or service state were changed during that first attempt.

## Server Release Completed

After the `meng` SSH account became available, commit `e8fc61a` was deployed as
a clean release:

```text
/srv/jingjing-domestic/releases/20260520144018-e8fc61a
```

Previous release:

```text
/srv/jingjing-domestic/releases/20260520140700-a5e9c08
```

Build passed on ECS:

```text
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

Current symlink:

```text
/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260520144018-e8fc61a
```

Final service state:

```text
jingjing-domestic-app.service: active
nginx: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

Health:

```text
/api/health: ok, postgres, aliyun_oss
OpenStoryline /ready: ready, fire_red
FireRed /api/ready: ready
```

Runtime note:

- FireRed/video-worker systemd units run as `ubuntu`.
- The clean release was owned by `jingjing:jingjing`.
- FireRed startup needed runtime symlinks inside the release directory.
- The new release now has symlinks for `.storyline`, `resource`, and `outputs`
  pointing to `/srv/jingjing-video-worker/firered/*`.
- Worker env and `video-results/*` output prefix were not changed.

Server source verification:

```text
member voice_profile path: bgm.enabled=true
member system voiceover fallback path: bgm.enabled=true
```

## Failure Fields

No video job was launched, so the video-chain fields are intentionally empty:

| Field | Value |
|---|---|
| video job id | not created |
| daily task id | not created |
| member user id | not used |
| final asset id / object key | none |
| FireRed run id | not created |
| failed step | none for release; no video job launched |
| upload / ASR / clone TTS / timeline / render / OSS | not reached |
| failure log summary | first attempt blocked by SSH publickey; second attempt deployed successfully after `meng` SSH account was provided |

## Branch / Push

```text
local branch: 孟_5.13
gitee branch: 孟_5.13
code commit: 073a38e
latest gitee commit: e8fc61a
push: yes
merge: no additional merge
server release: deployed
```

