# 2026-05-19 Aliyun Agent / Skill / Knowledge Seed Migration Handoff

## Current State

The Aliyun self-hosted PostgreSQL database now contains the previously configured consultation Agent assets, DBS skills, and platform knowledge seeds.

This was done by applying the original committed Supabase seed SQL to Aliyun RDS after adding a narrow self-host schema compatibility migration for `inline_seed`.

## Key Files

Code / schema:

- `app/db/migrations/202605190001_selfhost_inline_seed_knowledge_provider.sql`
- `app/src/contracts/knowledge.ts`

Progress:

- `docs/progress/2026-05-19-aliyun-agent-knowledge-seed-migration.md`

Source seed SQL:

- `app/supabase/migrations/202605070001_consultation_dbs_skill_references.sql`
- `app/supabase/migrations/202605070002_marketing_dbs_skills.sql`
- `app/supabase/migrations/202605070003_consultation_empty_profile_guardrails.sql`
- `app/supabase/migrations/202605070004_consultation_agent_prompt_soul.sql`
- `app/supabase/migrations/202605070005_consultation_agent_prompt_debias_terms.sql`
- `app/supabase/migrations/202605070006_consultation_user_context_language.sql`

## RDS Result

Final verified counts:

- `agent_configs`: 2
- `agent_skills`: 8
- `knowledge_sets`: 6
- `knowledge_documents`: 6
- `knowledge_chunks`: 18
- `agent_skill_bindings`: 8
- `agent_knowledge_set_bindings`: 6
- `knowledge_set_documents`: 6

Agents:

- `initial_consultation_agent`: enabled
- `marketing_expert_agent` / `营销专家`: enabled

Knowledge:

- `dbs_content_method_reference`: 9 chunks, 101789 total chunk chars
- `dbs_content_platform_reference`: 5 chunks, 54272 total chunk chars
- Four consultation DBS reference docs are also present and indexed.

Consultation route:

- `consultation_default` is active and points to `initial_consultation_agent`.

Active prompt / soul:

- Active prompt is consultation Agent `agent.md v4`.
- Active soul is consultation Agent `soul.md v3`.

## Validation

Passed:

- `pnpm --dir app typecheck`
- `pnpm --dir app lint`
- `pnpm --dir app build`
- `node --check app/scripts/check-domestic-agent-admin-writes-smoke.mjs`
- `node --check app/scripts/check-domestic-knowledge-repository-smoke.mjs`
- `git diff --check`

## Operational Notes

- No secrets were printed or committed.
- SQL files were staged temporarily on ECS under `/tmp/jingjing-agent-seed/`.
- The deployed app release was not rebuilt for this data-only RDS seed apply; the code change is type/schema compatibility for future releases.
- The old prompt/soul seed SQL files should not be repeatedly replayed raw because they can create duplicate archived prompt/soul versions. A verification replay exposed this, and duplicates were cleaned.

## Remaining Work

Recommended next step:

1. Use the browser against `http://8.154.28.41` to manually verify consultation UI behavior with the seeded Agent/Skill/Knowledge setup.
2. If the manual product QA needs a stable PM account, create or confirm a dedicated QA merchant account before testing.
3. Keep TTS / ASR / HTTPS / domain / ICP as separate workstreams.

Still not claimed complete:

- No TTS / voiceover migration.
- No ASR migration.
- No Docker-image reproducible deployment.
- RDS SSL still uses the Phase 1 private-network `sslmode=disable` posture.
- No DNS / HTTPS / ICP hookup.
- No merge to `main`.
- No completion marker.

