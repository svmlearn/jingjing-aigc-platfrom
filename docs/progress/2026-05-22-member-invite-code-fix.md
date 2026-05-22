# 2026-05-22 member invite code fix

## Scope

Fix member-side registration failing for valid merchant team invitation codes in the domestic PostgreSQL deployment.

## Symptom

- Merchant team page showed active `TEAM-*` invitation codes.
- Member-side registration with a visible code returned "邀请码不存在".
- Because registration failed, the new member could not appear in the merchant team member list.

## Root Cause

`app/src/lib/db/postgres-video-chain-repository.ts` normalized member invitation codes by stripping every non-alphanumeric character:

```ts
code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
```

Generated member team codes are stored with a hyphen, for example `TEAM-6BB41E8663`. The lookup therefore searched for `TEAM6BB41E8663`, which did not match the database row.

## Local Fix

- Preserve the stored hyphenated invite-code format in `normalizeMemberInvitationCode`.
- Add a contract test covering the PostgreSQL path so future changes cannot silently strip hyphens again.

## Local Verification

Run in `app/`:

```text
node --test src/lib/db/merchant-repository-domestic-contract.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
git diff --check
```

Result:

- Contract test passed.
- Typecheck passed.
- Lint passed with existing warnings only.
- Build passed.
- Diff check passed with CRLF warnings only.

## Release Plan

Follow the formal release flow requested on 2026-05-22:

1. Commit fix on local branch `codex/member-invite-code-hyphen-fix`.
2. Merge the fix into local `main`.
3. Push local `main` to remote branch `5.22_bgm_fix`.
4. Build and deploy a clean archive from the committed source into a new server release directory.
5. Switch `/srv/jingjing-domestic/current` only after the release build passes.

No server hot update should be used for this fix.

## Release Result

Released.

Source:

- Local branch: `main`
- Gitee branch: `5.22_bgm_fix`
- Released commit: `468ad9a5ebff6018a20172c0859f190d3e1571ad`
- Short commit: `468ad9a`

Server:

- ECS: `meng@8.154.28.41`
- Previous release: `/srv/jingjing-domestic/releases/20260522005432-d8f709e`
- New release: `/srv/jingjing-domestic/releases/20260522111747-468ad9a`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260522111747-468ad9a`

Pre-release checks:

- `5.22_bgm_fix` pointed to `468ad9a5ebff6018a20172c0859f190d3e1571ad`.
- `video_edit_jobs` had no in-flight `pending`, `queued`, `preparing`, or `running` jobs.
- `content_generation_jobs` still had one stale `running` row from `2026-05-21 04:19:32+08`:
  `90dd08b1-fad7-4c3f-8689-cf2b52775ea1`.
- No database task status was changed before release.

Release steps:

1. Created `/tmp/jingjing-468ad9a.tar` locally from `git archive 468ad9a`.
2. Uploaded it to `/tmp/jingjing-468ad9a.tar` on the ECS.
3. Created `/srv/jingjing-domestic/releases/20260522111747-468ad9a`.
4. Extracted the archive and set release ownership to `ubuntu:ubuntu`.
5. Built the app on the server:

```text
cd /srv/jingjing-domestic/releases/20260522111747-468ad9a/app
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

6. Switched `/srv/jingjing-domestic/current` to the new release.
7. Restarted:
   - `jingjing-domestic-app.service`
   - `jingjing-content-generation-worker.service`
   - `jingjing-firered-openstoryline.service`
   - `jingjing-openstoryline-engine.service`
   - `jingjing-video-worker.service`
8. Reloaded `nginx.service`.

Verification:

```text
nginx: active
jingjing-domestic-app.service: active
jingjing-content-generation-worker.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

Health checks:

```text
http://127.0.0.1:3000/api/health: ok, database=postgres, storage=aliyun_oss
http://8.154.28.41/api/health: ok, database=postgres, storage=aliyun_oss
http://127.0.0.1:8000/ready: ready, engine_adapter=fire_red
http://127.0.0.1:7860/api/ready: ready, tool_count=21, render_video_available=true
```

Runtime source check:

```text
/srv/jingjing-domestic/current/app/src/lib/db/postgres-video-chain-repository.ts
normalizeMemberInvitationCode -> return code.trim().toUpperCase();
```

Member registration smoke:

- Inserted a temporary team code `TEAM-CODEX112322` for merchant
  `fd3239da-4f6d-458c-86b7-2267a4a1a52b`.
- Posted to `/api/auth/member-register-with-invite` with JSON accept header.
- API returned `201`.
- Response included one workspace for `房地产-东洲项目` and `role=member`.
- Database briefly showed an active `merchant_team_members` row:
  `member | active | Codex Smoke 112322`.
- Cleaned the temporary member user and invitation code.
- Follow-up cleanup also removed one earlier leftover smoke invitation code
  `CODEX-MEMBER-125950`.
- Final cleanup check found no `codex-smoke-*` test user membership rows and no
  `codex smoke test` invitation codes.

Not done:

- No real user account was created or kept.
- No real merchant invitation code was consumed.
- No video job or content generation job was started.
