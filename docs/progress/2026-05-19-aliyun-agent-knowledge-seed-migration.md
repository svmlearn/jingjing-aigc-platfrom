# 2026-05-19 Aliyun Agent / Skill / Knowledge Seed Migration

## Goal

Migrate the previously configured consultation Agent assets, DBS skills, and platform knowledge seeds into the Aliyun self-hosted PostgreSQL database without rewriting or summarizing their content.

The source of truth for this round was the existing Supabase seed SQL already committed in the repository, especially:

- `app/supabase/migrations/202605070001_consultation_dbs_skill_references.sql`
- `app/supabase/migrations/202605070002_marketing_dbs_skills.sql`
- `app/supabase/migrations/202605070003_consultation_empty_profile_guardrails.sql`
- `app/supabase/migrations/202605070004_consultation_agent_prompt_soul.sql`
- `app/supabase/migrations/202605070005_consultation_agent_prompt_debias_terms.sql`
- `app/supabase/migrations/202605070006_consultation_user_context_language.sql`

No new AI-generated replacement skill body was written. The large skill bodies and knowledge chunks came from the original SQL files.

## Code / Schema Changes

Added:

- `app/db/migrations/202605190001_selfhost_inline_seed_knowledge_provider.sql`

Updated:

- `app/src/contracts/knowledge.ts`

Reason:

- The old seed SQL uses `knowledge_documents.storage_provider = 'inline_seed'`.
- The self-hosted PostgreSQL schema previously allowed only `tencent_cos`, `aliyun_oss`, and `supabase_storage`.
- The additive migration expands only `knowledge_documents.storage_provider` to allow `inline_seed`.
- Media / video storage provider constraints were not changed.

## Aliyun RDS Apply

Target runtime:

- ECS: `8.154.28.41`
- App env path: `/srv/jingjing-domestic/shared/env/app.env`
- Database: Aliyun RDS PostgreSQL `jingjing_domestic`
- DB provider: `postgres`

Applied in order:

1. `202605190001_selfhost_inline_seed_knowledge_provider.sql`
2. `202605070001_consultation_dbs_skill_references.sql`
3. `202605070002_marketing_dbs_skills.sql`
4. `202605070003_consultation_empty_profile_guardrails.sql`
5. `202605070004_consultation_agent_prompt_soul.sql`
6. `202605070005_consultation_agent_prompt_debias_terms.sql`
7. `202605070006_consultation_user_context_language.sql`

Secret handling:

- No RDS password, AccessKey, API key, provider key, cookie, or token was printed.
- SQL files were copied to `/tmp/jingjing-agent-seed/` on ECS for apply and verification.

## Verification

Final RDS counts:

| Table / entity | Count |
| --- | ---: |
| `agent_configs` | 2 |
| `agent_skills` | 8 |
| `knowledge_sets` | 6 |
| `knowledge_documents` | 6 |
| `knowledge_chunks` | 18 |
| `agent_skill_bindings` | 8 |
| `agent_knowledge_set_bindings` | 6 |
| `knowledge_set_documents` | 6 |

Agents:

| Agent key | Display name | Status |
| --- | --- | --- |
| `initial_consultation_agent` | `Initial Consultation Agent` | `enabled` |
| `marketing_expert_agent` | `营销专家` | `enabled` |

Skills:

| Skill key | Status | Body chars |
| --- | --- | ---: |
| `dbs_ai_check` | `enabled` | 5126 |
| `dbs_benchmark` | `enabled` | 361 |
| `dbs_content` | `enabled` | 4641 |
| `dbs_deconstruct` | `enabled` | 399 |
| `dbs_diagnosis` | `enabled` | 448 |
| `dbs_goal` | `enabled` | 375 |
| `dbs_hook` | `enabled` | 4796 |
| `dbs_xhs_title` | `enabled` | 13716 |

Knowledge sets:

- `base_platform_knowledge`
- `dbs_benchmark_analysis_knowledge`
- `dbs_business_diagnosis_knowledge`
- `dbs_concept_deconstruction_knowledge`
- `dbs_goal_clarification_knowledge`
- `dbs_marketing_content_knowledge`

Seed documents:

| Seed key | Provider | Status | Chunks | Total chunk chars |
| --- | --- | --- | ---: | ---: |
| `dbs_benchmark_reference` | `inline_seed` | `indexed` | 1 | 170 |
| `dbs_content_method_reference` | `inline_seed` | `indexed` | 9 | 101789 |
| `dbs_content_platform_reference` | `inline_seed` | `indexed` | 5 | 54272 |
| `dbs_deconstruct_reference` | `inline_seed` | `indexed` | 1 | 193 |
| `dbs_diagnosis_reference` | `inline_seed` | `indexed` | 1 | 209 |
| `dbs_goal_reference` | `inline_seed` | `indexed` | 1 | 149 |

Consultation route:

- `consultation_default` remains active and points to `initial_consultation_agent`.

Active prompt / soul:

- Active prompt: `initial_consultation_agent` version 4, 1570 chars, `咨询 Agent agent.md v4：改为用户信息语境，并加入用户纠偏协议。`
- Active soul: `initial_consultation_agent` version 4, 634 chars, `咨询 Agent soul.md v3：改为用户信息语境，并强化纠偏时的表达风格。`

## Local Validation

Passed:

- `pnpm --dir app typecheck`
- `pnpm --dir app lint`
- `pnpm --dir app build`
- `node --check app/scripts/check-domestic-agent-admin-writes-smoke.mjs`
- `node --check app/scripts/check-domestic-knowledge-repository-smoke.mjs`
- `git diff --check`

## Important Note

The old Supabase prompt/soul seed migrations were safe for the original one-time staging apply, but they are not perfectly idempotent for repeated raw replays: repeated execution can create extra archived prompt/soul versions. During this round, a verification replay exposed that behavior; duplicate archived versions were cleaned, leaving a clean version history:

- Prompt v1 archived, v2 archived, v3 archived, v4 active.
- Soul v1 archived, v2 archived, v3 archived, v4 active.

Do not repeatedly replay the raw `202605070004` / `202605070005` / `202605070006` SQL files on this RDS without an idempotent wrapper.

## Out Of Scope

- No live Supabase export was performed.
- No user/private merchant conversations were migrated.
- No file objects were copied from Supabase Storage.
- No DNS / ICP / RDS public access / OSS public access changes.
- No TTS / ASR migration.
- No `DOMESTIC_PHASE1_E2E_PASS` marker.

