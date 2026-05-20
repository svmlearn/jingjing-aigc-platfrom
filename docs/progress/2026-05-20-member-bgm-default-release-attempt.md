# 2026-05-20 member BGM default release attempt

## Scope

Set the member-side video edit production config to enable BGM by default.

Guardrails honored:

- No secrets printed.
- No DNS, ICP, RDS public access, or OSS public permission changes.
- No Supabase/COS/Vercel old config restored.
- No worker output prefix changed.
- Member path was not changed back to `/dashboard/video`.
- No `merchant_media_*` table was created.
- Member Dify primary path was not changed to `video-workbench-agent`.
- No server hot patch was applied.

## Local Code Change

Branch: `孟_5.13`

Commit:

```text
073a38e fix: enable member video bgm by default
```

Changed file:

```text
app/src/components/member/member-workspace.tsx
```

Behavior:

- `buildMemberVideoProductionConfig` now sets `bgm.enabled=true` when a `voiceProfile` exists.
- `buildMemberVideoProductionConfig` now sets `bgm.enabled=true` for the system voiceover fallback path.

## Validation

Passed:

```text
corepack pnpm typecheck
git diff --check
git ls-remote gitee refs/heads/孟_5.13 -> 073a38e
```

Not run:

```text
corepack pnpm test -- video-job-payload.test.ts
```

Reason: `app/package.json` has no `test` script, so pnpm reported `Command "test" not found`.

## Gitee Push

Pushed to Gitee:

```text
remote: gitee
branch: 孟_5.13
before: 002aab3
after: 073a38e
```

## Server Release Attempt 1

Target from current deployment docs:

```text
ECS: 8.154.28.41
user attempted: ubuntu, root
release root: /srv/jingjing-domestic/releases
current symlink: /srv/jingjing-domestic/current
```

Result: blocked before release deployment.

Failure summary:

```text
ubuntu@8.154.28.41: Permission denied (publickey).
root@8.154.28.41: Permission denied (publickey).
```

Tried local keys without success:

```text
~/.ssh/id_rsa
~/.ssh/id_ed25519
```

No SSH agent key was available:

```text
ssh-add -l -> Error connecting to agent: No such file or directory
ssh-agent service -> Stopped / Disabled
```

No server files were changed because SSH authentication failed.

## Server Release Attempt 2

After the `meng` SSH account was provided, deployment continued through the
clean release path.

SSH / permission check:

```text
ssh user: meng
groups: meng sudo jingjing-ops
sudo: passwordless sudo ok
```

Previous server release before this deployment:

```text
/srv/jingjing-domestic/releases/20260520140700-a5e9c08
```

New release:

```text
/srv/jingjing-domestic/releases/20260520144018-e8fc61a
source: git archive e8fc61a
```

Build:

```text
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
result: passed
```

Deployment actions:

```text
ln -sfn /srv/jingjing-domestic/releases/20260520144018-e8fc61a /srv/jingjing-domestic/current
systemctl restart jingjing-domestic-app.service jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
systemctl reload nginx
```

Runtime permission issue encountered after switching:

```text
jingjing-firered-openstoryline.service:
ln: failed to create symbolic link '/srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/.storyline': Permission denied
```

Cause:

- The FireRed and video-worker systemd units run as `ubuntu`.
- The clean release directory was owned by `jingjing:jingjing`.
- FireRed `run.sh` creates runtime symlinks inside the release directory when
  `VIDEO_WORKER_HOST_ROOT` is set.

Fix applied inside the new release only:

```text
/srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/.storyline -> /srv/jingjing-video-worker/firered/.storyline
/srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/resource -> /srv/jingjing-video-worker/firered/resource
/srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/outputs -> /srv/jingjing-video-worker/firered/outputs
```

This kept the existing persistent runtime dirs and did not change worker env or
the `video-results/*` output prefix.

Final service state:

```text
jingjing-domestic-app.service: active
nginx: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

Health checks:

```text
/api/health: ok
database.provider: postgres
storage.provider: aliyun_oss
storage.bucket: jingjing-domestic-phase1-hz
OpenStoryline /ready: ready, engine_adapter=fire_red
FireRed /api/ready: ready, render_video_available=true
```

Server source verification:

```text
app/src/components/member/member-workspace.tsx
voice_profile path: bgm.enabled=true
system voiceover fallback path: bgm.enabled=true
```

## Requested Failure Fields

No video task was started in this attempt.

| Field | Value |
|---|---|
| video job id | not created |
| daily task id | not created |
| member user id | not used |
| final asset id / object key | none |
| FireRed run id | not created |
| failed step | server release deployment |
| upload / ASR / clone TTS / timeline / render / OSS | not reached |
| failure log summary | ECS SSH publickey authentication failed for `ubuntu` and `root`; no release directory was created and no service was restarted |

## Current State

- Local worktree was clean after commit.
- Gitee `孟_5.13` points to `e8fc61a`.
- ECS `/srv/jingjing-domestic/current` points to `/srv/jingjing-domestic/releases/20260520144018-e8fc61a`.
- App, Nginx, FireRed, OpenStoryline, and video worker are active.
- No video job was started in this deployment attempt.

