-- V0.1 AI runtime vector search
-- Scope:
-- - keep knowledge_chunks.embedding at vector(1536)
-- - expose a service-role callable vector match function for RAG retrieval

create extension if not exists vector;

create index if not exists idx_knowledge_chunks_embedding_hnsw
on public.knowledge_chunks
using hnsw (embedding vector_cosine_ops)
where embedding is not null;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer,
  document_ids uuid[]
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  token_count integer,
  metadata jsonb,
  created_at timestamptz,
  score double precision
)
language sql
stable
as $$
  select
    chunks.id,
    chunks.document_id,
    chunks.chunk_index,
    chunks.content,
    chunks.token_count,
    chunks.metadata,
    chunks.created_at,
    1 - (chunks.embedding <=> query_embedding) as score
  from public.knowledge_chunks as chunks
  where chunks.embedding is not null
    and chunks.document_id = any(document_ids)
  order by chunks.embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;
