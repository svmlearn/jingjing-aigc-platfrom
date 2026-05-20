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

## Blocker

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

No server files, env files, DNS, ICP, RDS, OSS permissions, worker prefix, or service state were changed.

## Next Step

Provide or enable the correct ECS SSH identity for `8.154.28.41`, then deploy commit `073a38e` as a clean release under:

```text
/srv/jingjing-domestic/releases
```

After build passes, switch:

```text
/srv/jingjing-domestic/current
```

to the new release and restart the normal services. Keep the existing Aliyun OSS provider and `video-results/*` worker output prefix.

## Failure Fields

No video job was launched, so the video-chain fields are intentionally empty:

| Field | Value |
|---|---|
| video job id | not created |
| daily task id | not created |
| member user id | not used |
| final asset id / object key | none |
| FireRed run id | not created |
| failed step | server release deployment |
| upload / ASR / clone TTS / timeline / render / OSS | not reached |
| failure log summary | ECS SSH publickey authentication failed before release creation |

## Branch / Push

```text
local branch: 孟_5.13
gitee branch: 孟_5.13
commit: 073a38e
push: yes
merge: no additional merge
server release: blocked
```

