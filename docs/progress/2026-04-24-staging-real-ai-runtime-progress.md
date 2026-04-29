# 2026-04-24 staging real AI runtime progress

## Scope

- Worktree: `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- Branch intent: continue main workspace, do not switch back to `-cloud-demo` worktree.
- Target environment: staging Supabase + staging Vercel.
- Explicit guardrails followed:
  - Did not touch `openclaw`.
  - Did not use `/Users/wy/Documents/wy.pem`.
  - Did not print full API keys to logs or docs.

## SiliconFlow key

- Created one retained SiliconFlow API key for staging:
  - Description: `jingjing-staging-llm-runtime-20260424`
  - Mask: `sk-djh...labi`
  - Account visible in console: `Beijing-GuiJiLiuDongAIYunFuWu-20251201S0112`
- A first browser-created key was accidentally created while testing the console copy flow:
  - Description: `jingjing-staging-llm-20260424`
  - Mask: `sk-ext...kvnu`
  - Cleanup: deleted via SiliconFlow console API, leaving only the retained runtime key.
- Local storage:
  - `app/.env.local` contains `SILICONFLOW_API_KEY` and `EMBEDDING_DIMENSIONS=1536`.
  - `app/.env.local` is ignored by `app/.gitignore`.
- Vercel storage:
  - Added `SILICONFLOW_API_KEY` to Production and Preview.
  - Added `EMBEDDING_DIMENSIONS=1536` to Production and Preview.

## Code and config changes

- Added deployment safety ignore file:
  - `app/.vercelignore`
  - Excludes `.env*`, `.next`, `node_modules`, and `*.tsbuildinfo` from Vercel uploads.
- Existing real AI runtime code in this work session:
  - `app/src/server/api/ai-runtime.ts`
  - `app/src/server/api/knowledge-service.ts`
  - `app/src/server/api/consultation-service.ts`
  - `app/src/lib/db/knowledge-repository.ts`
  - `app/src/lib/db/platform-admin-repository.ts`
  - `app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql`
- Local validation:
  - `pnpm lint`: passed.
  - `NEXT_TELEMETRY_DISABLED=1 pnpm build`: passed.

## Supabase

- Project ref: `jrveaabguddromjtibbs`
- Applied migration:
  - `app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql`
- Verification:
  - RPC exists: `match_knowledge_chunks(vector,integer,uuid[])`
  - HNSW index exists: `idx_knowledge_chunks_embedding_hnsw`
  - `knowledge_chunks.embedding` column exists.
- Updated `platform_settings`:
  - `llm_runtime.providerLabel`: `SiliconFlow`
  - `llm_runtime.baseUrl`: `https://api.siliconflow.cn/v1`
  - `llm_runtime.primaryModel`: `Qwen/Qwen3-32B`
  - `llm_runtime.fallbackModel`: `Qwen/Qwen3-14B`
  - `llm_runtime.timeoutSeconds`: `60`
  - `consultation_agent.model`: `Qwen/Qwen3-32B`
  - `knowledge_runtime.embeddingModel`: `Qwen/Qwen3-Embedding-4B`

## Vercel deployment

- Project: `jingjing-content-platform-staging`
- Final deployment:
  - Inspect: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/7S5icvHCgLkFP28kVitwyLsqKcJn`
  - Production URL: `https://jingjing-content-platform-staging-fjohv7nkv.vercel.app`
  - Alias: `https://jingjing-content-platform-staging.vercel.app`
- Deployment build:
  - Remote build passed.
  - Final deploy after `.vercelignore` no longer showed the `.env file detected` warning.

## Real API smoke

- Direct SiliconFlow API checks:
  - `Qwen/Qwen3-14B` chat completion: HTTP 200, replied `可用`.
  - `Qwen/Qwen3-32B` chat completion: HTTP 200, replied `OK`.
  - `Qwen/Qwen3-Embedding-4B` embedding: HTTP 200, dimensions `1536`.

- Staging knowledge upload:
  - Title: `Real AI Smoke Knowledge JJ-REAL-AI-20260424100257-7CDB1F`
  - Document ID: `6cf2d047-74fb-49cb-8f79-11e5fe5d7ef6`
  - Status: `indexed`
  - Embedded chunks: `1`
  - Chunk metadata:
    - `embeddingStatus`: `embedded`
    - `embeddingModel`: `Qwen/Qwen3-Embedding-4B`
    - `embeddingDimensions`: `1536`

- Staging consultation smoke:
  - Invite: `JJ-REAL-AI-20260424100257-45F5`
  - User ID: `960af7c0-3f80-450b-adcd-fcb76dd33ff0`
  - Session ID: `7a675609-642d-480b-9a3b-d64039e138db`
  - Assistant reply included the smoke marker and `向量检索已启用`.
  - Event result:
    - `llm.response.completed`
    - Model: `Qwen/Qwen3-32B`
    - Knowledge retrieval mode: `vector_with_lexical_fallback`
    - Embedding mode: `embedded`
    - Match count: `1`

## Temporary secret files

- New temp secret pointer files created in this run:
  - `/tmp/jj_siliconflow_key_path.txt`
  - `/tmp/jj_staging_real_ai_env_path.txt`
- These pointer files reference temporary files containing sensitive values.
- Previous run also left:
  - `/tmp/jingjing-staging-acceptance-20260424155519.env`
- Do not paste these files into docs or chat. Delete them after user confirmation.

## Current status

- Real SiliconFlow API key is configured locally and on Vercel staging.
- Knowledge ingestion now creates real embeddings.
- Consultation agent now completes with real LLM response instead of fallback.
- Vector retrieval path is live on staging and verified with a real smoke marker.
