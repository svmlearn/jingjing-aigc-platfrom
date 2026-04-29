# 2026-04-24 staging real AI runtime handoff

## Current goal

Finish the staging integration for real SiliconFlow API usage:

- Create a project-specific SiliconFlow API key.
- Store secrets safely in local env and Vercel encrypted env.
- Configure staging platform settings for SiliconFlow chat + embedding models.
- Apply vector search migration.
- Redeploy Vercel staging.
- Prove knowledge embedding + consultation agent LLM loop with real API calls.

## Completed

- Created and retained SiliconFlow key:
  - Description: `jingjing-staging-llm-runtime-20260424`
  - Mask: `sk-djh...labi`
- Deleted accidental extra key:
  - Description: `jingjing-staging-llm-20260424`
  - Mask: `sk-ext...kvnu`
- Local env:
  - `app/.env.local` now contains `SILICONFLOW_API_KEY` and `EMBEDDING_DIMENSIONS=1536`.
  - File is ignored by Git.
- Vercel env:
  - `SILICONFLOW_API_KEY`: Production + Preview.
  - `EMBEDDING_DIMENSIONS=1536`: Production + Preview.
- Supabase migration applied:
  - `app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql`
  - Verified `match_knowledge_chunks(vector,integer,uuid[])`.
  - Verified HNSW index `idx_knowledge_chunks_embedding_hnsw`.
- Platform settings updated:
  - Base URL: `https://api.siliconflow.cn/v1`
  - Chat model: `Qwen/Qwen3-32B`
  - Fallback model: `Qwen/Qwen3-14B`
  - Embedding model: `Qwen/Qwen3-Embedding-4B`
- Added `app/.vercelignore` to keep local env/build artifacts out of Vercel uploads.
- Final Vercel deployment:
  - Inspect: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/7S5icvHCgLkFP28kVitwyLsqKcJn`
  - Deployment: `https://jingjing-content-platform-staging-fjohv7nkv.vercel.app`
  - Alias: `https://jingjing-content-platform-staging.vercel.app`

## Verification

- Local:
  - `pnpm lint`: passed.
  - `NEXT_TELEMETRY_DISABLED=1 pnpm build`: passed.
- SiliconFlow direct API:
  - `Qwen/Qwen3-14B`: HTTP 200.
  - `Qwen/Qwen3-32B`: HTTP 200.
  - `Qwen/Qwen3-Embedding-4B`: HTTP 200, returned 1536 dimensions.
- Staging knowledge smoke:
  - Document ID: `6cf2d047-74fb-49cb-8f79-11e5fe5d7ef6`
  - Status: `indexed`
  - Embedded chunks: `1`
  - Metadata confirms `embeddingStatus=embedded`, `embeddingModel=Qwen/Qwen3-Embedding-4B`, `embeddingDimensions=1536`.
- Staging consultation smoke:
  - Session ID: `7a675609-642d-480b-9a3b-d64039e138db`
  - Event: `llm.response.completed`
  - Model: `Qwen/Qwen3-32B`
  - Retrieval mode: `vector_with_lexical_fallback`
  - Match count: `1`

## Files changed

- `app/.env.local`:
  - Created/updated locally with secret values.
  - Ignored by Git.
  - Do not copy into docs or commits.
- `app/.vercelignore`
- Existing AI runtime files from this work stream:
  - `app/src/server/api/ai-runtime.ts`
  - `app/src/server/api/knowledge-service.ts`
  - `app/src/server/api/consultation-service.ts`
  - `app/src/lib/db/knowledge-repository.ts`
  - `app/src/lib/db/platform-admin-repository.ts`
  - `app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql`
- New docs:
  - `docs/progress/2026-04-24-staging-real-ai-runtime-progress.md`
  - `docs/handoff/2026-04-24-staging-real-ai-runtime-handoff.md`

## Still open

- Temporary secret files still exist and should be deleted after user confirmation:
  - `/tmp/jj_siliconflow_key_path.txt`
  - `/tmp/jj_staging_real_ai_env_path.txt`
  - `/tmp/jingjing-staging-acceptance-20260424155519.env`
- No push or merge was performed.
- No commit was created.

## Recommended next step

Before any production move, rotate or separate keys by environment:

- Keep this key as staging-only.
- Create a separate production key only when production deployment is actually approved.
- Add key rotation notes to the platform ops docs.
