# Codex Runtime Errors

Project-specific reusable debugging records for the Jingjing content platform.

## Index

- [PJ-2026-05-22-001: Member registration says invitation code does not exist for TEAM-* codes](#pj-2026-05-22-001-member-registration-says-invitation-code-does-not-exist-for-team--codes)

## PJ-2026-05-22-001: Member registration says invitation code does not exist for TEAM-* codes

Status: solved

Scope: project, PostgreSQL domestic deployment, member team registration

### Quick Card

Symptom:

- Merchant team page shows active invitation codes such as `TEAM-6BB41E8663`.
- Member registration with a visible team code fails with `MEMBER_INVITATION_CODE_NOT_FOUND` or the UI message "邀请码不存在".
- Team members do not appear after the failed registration attempt.

Root cause:

- PostgreSQL repository lookup normalized member invite codes with `replace(/[^A-Z0-9]/g, "")`.
- Generated team invite codes are stored with the hyphen, for example `TEAM-6BB41E8663`.
- Lookup changed the user input to `TEAM6BB41E8663`, so the database query could not match the stored row.

Fix:

- In `app/src/lib/db/postgres-video-chain-repository.ts`, preserve generated hyphenated team code format:

```ts
function normalizeMemberInvitationCode(code: string) {
  return code.trim().toUpperCase();
}
```

Regression proof:

- `app/src/lib/db/merchant-repository-domestic-contract.test.ts` asserts PostgreSQL member invite lookup does not strip hyphens.

Verification used:

```text
node --test src/lib/db/merchant-repository-domestic-contract.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
git diff --check
```

### Full Postmortem

Impact:

- Members could not register through valid merchant team invite links/codes in the PostgreSQL deployment.
- Existing active codes still appeared in the merchant team page, which made the issue look like a registration or browser-session problem.

Detection path:

- Logged-in merchant team page confirmed active invitation codes were present for merchant `fd3239da-4f6d-458c-86b7-2267a4a1a52b`.
- User-provided registration screenshot showed a valid-looking `TEAM-*` code failing as not found.
- Code inspection found the PostgreSQL normalization path removed non-alphanumeric characters, while generated team codes include a hyphen.

Prevention:

- Keep generated code format and lookup normalization aligned.
- When a visible invite code fails lookup, first compare stored DB format with repository normalization before changing auth, cookies, or browser state.
- Release this kind of fix through the formal server release directory flow, not by patching `/srv/jingjing-domestic/current` directly.
