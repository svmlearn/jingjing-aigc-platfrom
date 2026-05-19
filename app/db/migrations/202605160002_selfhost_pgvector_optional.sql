-- Optional pgvector migration for self-hosted PostgreSQL.
-- The core P0 foundation migration must remain usable when pgvector is absent.
-- This file exits successfully with a NOTICE if the target database cannot enable vector.

do $$
declare
  has_vector_extension boolean;
begin
  if to_regclass('public.knowledge_chunks') is null then
    raise notice 'knowledge_chunks is missing; run 202605160001_selfhost_p0_foundation.sql first.';
    return;
  end if;

  select exists (
    select 1
    from pg_available_extensions
    where name = 'vector'
  )
  into has_vector_extension;

  if not has_vector_extension then
    raise notice 'pgvector extension is not available on this PostgreSQL instance; leaving embedding_json fallback only.';
    return;
  end if;

  begin
    execute 'create extension if not exists vector';
  exception
    when others then
      raise notice 'pgvector extension could not be enabled: %. Leaving embedding_json fallback only.', sqlerrm;
      return;
  end;

  begin
    execute 'alter table public.knowledge_chunks add column if not exists embedding vector(1536)';
  exception
    when others then
      raise notice 'knowledge_chunks.embedding vector column could not be created: %. Leaving embedding_json fallback only.', sqlerrm;
      return;
  end;

  begin
    execute 'create index if not exists idx_knowledge_chunks_embedding_hnsw on public.knowledge_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null';
  exception
    when others then
      raise notice 'HNSW index could not be created: %. Vector search can still use sequential scan.', sqlerrm;
  end;

  execute $function$
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
    as $sql$
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
    $sql$;
  $function$;
end;
$$;
