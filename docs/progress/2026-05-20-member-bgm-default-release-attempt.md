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

## Server Release Attempt

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
- Gitee `孟_5.13` points to `073a38e`.
- ECS release is not updated by this attempt.
- Existing server runtime remains untouched.

