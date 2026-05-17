# 2026-05-16 Self-hosted Agent Admin Writes Handoff

## Current Goal

Complete P0 repository migration Batch 4B: Agent Console admin edit/write paths.

The goal is to let platform admins create/update/copy Agents, manage agent.md and soul.md, manage Skills, manage Knowledge Sets, bind Skills/Knowledge Sets, and switch `consultation_default` on ordinary PostgreSQL.

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Pre-work backup pushed to Gitee: `302fbff4abdb1ef60ece481233d55574c1e4f7a2`

## Completed

- `agent-console-repository.ts` now has self-hosted PostgreSQL write paths for:
  - `createAgentConfig`
  - `updateAgentConfig`
  - `copyAgentConfig`
  - `saveAgentPromptDraft`
  - `publishAgentPromptDraft`
  - `rollbackAgentPromptVersion`
  - `saveAgentSoulDraft`
  - `publishAgentSoulDraft`
  - `rollbackAgentSoulVersion`
  - `createAgentSkill`
  - `updateAgentSkill`
  - `replaceAgentSkillBindings`
  - `createKnowledgeSet`
  - `updateKnowledgeSet`
  - `replaceKnowledgeSetDocuments`
  - `replaceKnowledgeDocumentSets`
  - `replaceAgentKnowledgeSetBindings`
  - `setConsultationDefaultAgent`
- Supabase Admin fallback remains for legacy/staging paths.
- Added smoke:
  - `app/scripts/check-domestic-agent-admin-writes-smoke.mjs`
- Added progress:
  - `docs/progress/2026-05-16-selfhost-agent-admin-writes.md`

## Changed Files

```text
app/src/lib/db/agent-console-repository.ts
app/scripts/check-domestic-agent-admin-writes-smoke.mjs
docs/progress/2026-05-16-selfhost-agent-admin-writes.md
docs/handoff/2026-05-16-selfhost-agent-admin-writes-handoff.md
```

## Validation

Local passed:

```bash
node --check app/scripts/check-domestic-agent-admin-writes-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local DB-level smoke passed against a fresh ordinary PostgreSQL DB initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Local app/API smoke passed against a branch-built `next start` temp app:

```text
create Agent
save/publish prompt
enable Agent
save/publish soul
rollback prompt and soul
create/bind Skill
create Knowledge Set
bind Knowledge document
bind Knowledge Set to Agent
set consultation_default
resolve default Agent through /api/consultation/experts
copy Agent with active/draft prompt, active/draft soul, Skill binding, Knowledge Set binding
cleanup
```

Singapore passed:

- live `/api/health`: `ok=true`, DB provider `postgres`, COS configured
- live `jingjing-selfhost-app` preflight: `status=ok`
- new Agent Admin Writes smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`
- Knowledge Repository non-regression smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`

Singapore note:

- I did not replace the live app with this branch.
- The new API write paths were validated locally through a branch-built temp app.
- Singapore validation covered live health/preflight and DB compatibility against the Singapore self-hosted PostgreSQL.

## Not Done / Out Of Scope

- No credits / usage migration.
- No `ensureMerchantCreditAccount`, `recordMerchantUsageEvent`, `updateMerchantUsageEvent`, or `consumeMerchantCredits` migration.
- No OSS adapter or storage provider migration.
- No worker / FireRed / OpenStoryline / TTS changes.
- No platform admin user-management migration.
- No main merge.
- No completion marker write.

## Next Recommended Batch

Next batch should choose one of these explicitly:

1. `platform-admin-repository.ts` remaining admin-user / merchant / invitation-code management paths.
2. `import-repository.ts` write-path migration.
3. `material-library-repository.ts` and `material_workbench_references` migration.

Keep credits/usage, OSS adapter, and worker/TTS separate unless a new task brief explicitly scopes them.

