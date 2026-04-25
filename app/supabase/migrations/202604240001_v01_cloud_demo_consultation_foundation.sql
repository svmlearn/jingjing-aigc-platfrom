-- V0.1 cloud demo consultation foundation
-- Scope:
-- - consultation session / message / event persistence
-- - platform consultation + knowledge runtime settings
-- - platform knowledge document / chunk / ingestion job baseline

create extension if not exists vector;

alter table public.platform_settings
drop constraint if exists platform_settings_category_check;

alter table public.platform_settings
add constraint platform_settings_category_check
check (category in ('llm', 'import', 'membership', 'consultation', 'knowledge'));

create table if not exists public.consultation_sessions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  title text,
  status text not null default 'active',
  current_stage text,
  strategy_snapshot jsonb not null default '{}'::jsonb,
  summary_text text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'completed', 'archived'))
);

create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.consultation_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  stage_label text,
  tool_cards jsonb not null default '[]'::jsonb,
  visible_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (role in ('assistant', 'user', 'system'))
);

create table if not exists public.consultation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.consultation_sessions(id) on delete cascade,
  event_type text not null,
  stage_label text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'platform',
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  title text not null,
  source_name text,
  storage_provider text not null default 'tencent_cos',
  bucket_name text,
  storage_key text,
  mime_type text,
  status text not null default 'uploaded',
  summary_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope in ('platform', 'merchant')),
  check (status in ('uploaded', 'queued', 'processing', 'indexed', 'failed'))
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  check (chunk_index >= 0),
  check (token_count >= 0)
);

create table if not exists public.knowledge_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.knowledge_documents(id) on delete cascade,
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  job_type text not null default 'document_ingestion',
  status text not null default 'pending',
  input_payload jsonb not null default '{}'::jsonb,
  log_payload jsonb not null default '{}'::jsonb,
  error_summary text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (job_type in ('document_ingestion')),
  check (status in ('pending', 'queued', 'processing', 'succeeded', 'failed'))
);

create index if not exists idx_consultation_sessions_merchant_last_message
on public.consultation_sessions (merchant_id, last_message_at desc);

create index if not exists idx_consultation_messages_session_created_at
on public.consultation_messages (session_id, created_at asc);

create index if not exists idx_consultation_events_session_created_at
on public.consultation_events (session_id, created_at asc);

create index if not exists idx_knowledge_documents_scope_status_created_at
on public.knowledge_documents (scope, status, created_at desc);

create unique index if not exists ux_knowledge_chunks_document_chunk_index
on public.knowledge_chunks (document_id, chunk_index);

create index if not exists idx_knowledge_ingestion_jobs_status_created_at
on public.knowledge_ingestion_jobs (status, created_at desc);

drop trigger if exists trg_consultation_sessions_updated_at on public.consultation_sessions;
create trigger trg_consultation_sessions_updated_at
before update on public.consultation_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_documents_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_ingestion_jobs_updated_at on public.knowledge_ingestion_jobs;
create trigger trg_knowledge_ingestion_jobs_updated_at
before update on public.knowledge_ingestion_jobs
for each row execute function public.set_updated_at();

insert into public.platform_settings (key, category, value, description)
values
  (
    'consultation_agent',
    'consultation',
    '{
      "systemPrompt": "你是静境商家平台里的 AI 商业顾问。目标是帮助本地生活商家快速沉淀定位、卖点、目标客群、关键场景、内容策略和一周内容日历，并把结论转成后续图文与视频创作输入。",
      "enabledTools": [
        "read_merchant_profile",
        "retrieve_knowledge_base",
        "update_strategy_snapshot",
        "update_content_calendar",
        "generate_article_brief",
        "generate_video_brief",
        "read_history"
      ],
      "visibleExecutionMode": "cards",
      "maxRounds": 6,
      "retrievalTopK": 5,
      "model": "gpt-4.1-mini",
      "temperature": 0.6
    }'::jsonb,
    'Platform-level consultation agent settings.'
  ),
  (
    'knowledge_runtime',
    'knowledge',
    '{
      "retrievalTopK": 5,
      "chunkSize": 900,
      "chunkOverlap": 120,
      "embeddingModel": "text-embedding-3-small",
      "queryRewriteEnabled": true
    }'::jsonb,
    'Platform-level knowledge retrieval runtime settings.'
  )
on conflict (key) do nothing;

alter table public.consultation_sessions enable row level security;
alter table public.consultation_messages enable row level security;
alter table public.consultation_events enable row level security;

create policy consultation_sessions_owner_access
on public.consultation_sessions for all
using (
  merchant_id in (
    select mp.id
    from public.merchant_profiles mp
    where mp.owner_user_id = auth.uid()
  )
)
with check (
  merchant_id in (
    select mp.id
    from public.merchant_profiles mp
    where mp.owner_user_id = auth.uid()
  )
);

create policy consultation_messages_owner_access
on public.consultation_messages for all
using (
  session_id in (
    select cs.id
    from public.consultation_sessions cs
    join public.merchant_profiles mp on mp.id = cs.merchant_id
    where mp.owner_user_id = auth.uid()
  )
)
with check (
  session_id in (
    select cs.id
    from public.consultation_sessions cs
    join public.merchant_profiles mp on mp.id = cs.merchant_id
    where mp.owner_user_id = auth.uid()
  )
);

create policy consultation_events_owner_access
on public.consultation_events for all
using (
  session_id in (
    select cs.id
    from public.consultation_sessions cs
    join public.merchant_profiles mp on mp.id = cs.merchant_id
    where mp.owner_user_id = auth.uid()
  )
)
with check (
  session_id in (
    select cs.id
    from public.consultation_sessions cs
    join public.merchant_profiles mp on mp.id = cs.merchant_id
    where mp.owner_user_id = auth.uid()
  )
);
