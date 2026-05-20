# 2026-05-16 P0 Repository Migration Batch 1: Platform Admin Auth

## 1. Task Goal

Continue `codex/domestic-infra-migration` after the P0 self-hosted PostgreSQL foundation schema.

This batch migrates the platform admin authentication/session runtime from Supabase Auth to app-owned ordinary PostgreSQL.

The goal is:

```text
Platform admin can bootstrap/login/logout/check session on self-hosted PostgreSQL
without Supabase Auth, while existing merchant/video self-hosted smoke still passes.
```

This is not the full consultation/RAG/Agent repository migration yet.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Current expected local HEAD:

```text
12a880f docs: update foundation schema smoke notes
```

Important: local branch is expected to be ahead of Gitee by 3 commits:

```text
5ea29ba db: add selfhost p0 foundation schema
1acb768 docs: record selfhost p0 foundation schema validation
12a880f docs: update foundation schema smoke notes
```

Before making new code changes, push these commits to Gitee as a backup:

```bash
git push gitee codex/domestic-infra-migration
git status --short --branch
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-16-full-supabase-exit-audit.md
docs/架构规范/2026-05-16-selfhost-postgres-full-schema-plan.md
docs/progress/2026-05-16-selfhost-p0-foundation-schema.md
docs/handoff/2026-05-16-selfhost-p0-foundation-schema-handoff.md
```

Also inspect the current code before editing:

```text
app/src/lib/auth/platform-admin-session.ts
app/src/lib/db/platform-admin-repository.ts
app/src/app/platform-admin/**
app/src/app/api/platform-admin/**
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

## 4. Scope

### 4.1 Implement

Implement ordinary PostgreSQL platform-admin auth/session runtime for self-hosted mode.

Expected capability:

- Bootstrap or seed one platform admin user in a controlled self-hosted path.
- Store platform admin identity in `platform_admin_users`.
- Store sessions in `platform_admin_sessions`.
- Verify session from cookie/request without Supabase Auth.
- Logout invalidates/deletes the app-owned session.
- Existing platform admin pages/API can open in self-hosted mode using the app-owned session.

Prefer using the existing app database helper/pool patterns already introduced on this branch.

### 4.2 Password Handling

Do not store plaintext passwords.

Reuse an existing local password-hash convention if present. If none exists, add a small Node/app helper using a standard one-way hash with salt, and document the bootstrap command.

Do not print secrets in logs or progress docs.

### 4.3 Smoke Script

Add or extend a small smoke script, suggested:

```text
app/scripts/check-domestic-platform-admin-session-smoke.mjs
```

The smoke should prove, against ordinary PostgreSQL:

- foundation tables exist
- a test/bootstrap admin can be created or found
- login/session creation succeeds
- session lookup succeeds
- logout/session invalidation succeeds

If the browser/page smoke is practical, also verify that a protected platform-admin route/API no longer depends on Supabase Auth in self-hosted mode.

### 4.4 Do Not Implement Yet

Do not migrate these in this batch unless a tiny compatibility shim is required:

```text
consultation-repository.ts
merchant-strategy-asset-repository.ts
knowledge-repository.ts
agent-console-repository.ts full write path
material-library-repository.ts
import-repository.ts write path
Aliyun OSS adapter
pgvector/vector search
TTS/voiceover runtime fixes
```

Reason: each one deserves its own evidence trail. Keep this batch reviewable.

## 5. Validation Requirements

Local validation:

```text
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
node --check app/scripts/check-domestic-platform-admin-session-smoke.mjs
```

Run the new smoke against a local ordinary PostgreSQL DB if feasible.

Singapore self-hosted validation:

- Confirm `/api/health` still reports PostgreSQL and COS configured.
- Run app preflight.
- Run the new platform-admin session smoke against the Singapore self-hosted DB/app.
- Re-run at least one existing non-regression smoke from the previous round:
  - team invite + Dify mock, or
  - video-chain API smoke, or
  - worker fast-path smoke.

Normal FireRed no-voiceover and TTS/voiceover are not required for this batch unless you intentionally touch worker/runtime.

## 6. Guardrails

Do not write:

```text
DOMESTIC_PHASE1_E2E_PASS
DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

Do not mark `.codex/long-task/active.json` complete.

Do not merge to `main`.

Do not remove Supabase support globally unless the branch already has an explicit self-hosted fallback and the Supabase path remains harmless for old staging.

If a runtime change is made on the Singapore server, record exactly what changed without printing secrets.

## 7. Deliverables

Commit code and docs locally on `codex/domestic-infra-migration`.

Expected docs:

```text
docs/progress/2026-05-16-selfhost-platform-admin-session.md
docs/handoff/2026-05-16-selfhost-platform-admin-session-handoff.md
```

The progress doc should include:

- files changed
- migration/schema assumptions
- local validation result
- Singapore validation result
- whether branch was pushed
- exact residual risks

At the end, report:

- final HEAD commit
- whether worktree is clean
- whether pushed to Gitee
- whether any runtime env was changed
- what the next repository migration batch should be

