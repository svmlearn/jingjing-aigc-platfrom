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

Pending.
