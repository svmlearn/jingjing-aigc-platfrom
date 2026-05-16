-- Self-hosted PostgreSQL P0 foundation schema.
-- Adds the Supabase-exit foundation tables on top of the domestic core baseline.
-- Supabase auth schemas, RLS policies, storage APIs, and service-role grants are intentionally omitted.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.platform_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text,
  role text not null default 'admin',
  status text not null default 'active',
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_admin_users_email_check check (position('@' in email) > 1),
  constraint platform_admin_users_role_check check (role in ('super_admin', 'admin')),
  constraint platform_admin_users_status_check check (status in ('active', 'disabled'))
);

create unique index if not exists ux_platform_admin_users_lower_email
on public.platform_admin_users (lower(email));

create index if not exists idx_platform_admin_users_status_created_at
on public.platform_admin_users (status, created_at desc);

drop trigger if exists trg_platform_admin_users_updated_at on public.platform_admin_users;
create trigger trg_platform_admin_users_updated_at
before update on public.platform_admin_users
for each row execute function public.set_updated_at();

create table if not exists public.platform_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.platform_admin_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ux_platform_admin_sessions_token_hash
on public.platform_admin_sessions (token_hash);

create index if not exists idx_platform_admin_sessions_admin_expires_at
on public.platform_admin_sessions (admin_user_id, expires_at desc);

create index if not exists idx_platform_admin_sessions_expires_at
on public.platform_admin_sessions (expires_at);

create table if not exists public.platform_settings (
  key text primary key,
  category text not null,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_settings_value_object_check check (jsonb_typeof(value) = 'object')
);

alter table public.platform_settings
drop constraint if exists platform_settings_category_check;

alter table public.platform_settings
add constraint platform_settings_category_check
check (category in ('llm', 'import', 'membership', 'consultation', 'script_production', 'knowledge'));

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

create table if not exists public.platform_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.platform_admin_users(id) on delete set null,
  actor_label text not null,
  event_type text not null,
  target_type text not null,
  target_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint platform_admin_events_details_object_check check (jsonb_typeof(details) = 'object')
);

create index if not exists idx_platform_admin_events_created_at
on public.platform_admin_events (created_at desc);

create index if not exists idx_platform_admin_events_actor_created_at
on public.platform_admin_events (actor_admin_id, created_at desc);

create index if not exists idx_platform_admin_events_target_created_at
on public.platform_admin_events (target_type, target_id, created_at desc);

create table if not exists public.consultation_sessions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  title text,
  mode text not null default 'standard',
  status text not null default 'active',
  current_stage text,
  strategy_snapshot jsonb not null default '{}'::jsonb,
  summary_text text,
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint consultation_sessions_mode_check check (mode in ('standard', 'roundtable')),
  constraint consultation_sessions_status_check check (status in ('active', 'completed', 'archived')),
  constraint consultation_sessions_strategy_snapshot_object_check check (jsonb_typeof(strategy_snapshot) = 'object')
);

create index if not exists idx_consultation_sessions_merchant_last_message
on public.consultation_sessions (merchant_id, last_message_at desc);

create index if not exists idx_consultation_sessions_merchant_creator_last_message
on public.consultation_sessions (merchant_id, created_by_user_id, last_message_at desc);

drop trigger if exists trg_consultation_sessions_updated_at on public.consultation_sessions;
create trigger trg_consultation_sessions_updated_at
before update on public.consultation_sessions
for each row execute function public.set_updated_at();

create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.consultation_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  stage_label text,
  tool_cards jsonb not null default '[]'::jsonb,
  visible_summary jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint consultation_messages_role_check check (role in ('assistant', 'user', 'system')),
  constraint consultation_messages_tool_cards_array_check check (jsonb_typeof(tool_cards) = 'array'),
  constraint consultation_messages_visible_summary_object_check check (jsonb_typeof(visible_summary) = 'object')
);

create index if not exists idx_consultation_messages_session_created_at
on public.consultation_messages (session_id, created_at asc);

create index if not exists idx_consultation_messages_session_role_created_at
on public.consultation_messages (session_id, role, created_at desc);

create table if not exists public.consultation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.consultation_sessions(id) on delete cascade,
  message_id uuid references public.consultation_messages(id) on delete set null,
  event_type text not null,
  stage_label text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint consultation_events_status_check check (
    status is null or status in ('started', 'completed', 'skipped', 'failed')
  ),
  constraint consultation_events_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create index if not exists idx_consultation_events_session_created_at
on public.consultation_events (session_id, created_at asc);

create index if not exists idx_consultation_events_session_type_created_at
on public.consultation_events (session_id, event_type, created_at desc);

create index if not exists idx_consultation_events_message_id
on public.consultation_events (message_id)
where message_id is not null;

create table if not exists public.consultation_roundtable_states (
  session_id uuid primary key references public.consultation_sessions(id) on delete cascade,
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  current_phase text not null,
  status text not null default 'interviewing',
  state_payload jsonb not null default '{}'::jsonb,
  strategy_candidate jsonb,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint consultation_roundtable_states_phase_check check (
    current_phase in ('asset', 'skill', 'marketing', 'synthesis')
  ),
  constraint consultation_roundtable_states_status_check check (
    status in ('interviewing', 'phase_review', 'synthesis_review', 'completed')
  ),
  constraint consultation_roundtable_states_payload_object_check check (jsonb_typeof(state_payload) = 'object'),
  constraint consultation_roundtable_states_candidate_object_check check (
    strategy_candidate is null or jsonb_typeof(strategy_candidate) = 'object'
  )
);

create index if not exists idx_consultation_roundtable_states_merchant_updated_at
on public.consultation_roundtable_states (merchant_id, updated_at desc);

drop trigger if exists trg_consultation_roundtable_states_updated_at on public.consultation_roundtable_states;
create trigger trg_consultation_roundtable_states_updated_at
before update on public.consultation_roundtable_states
for each row execute function public.set_updated_at();

create table if not exists public.merchant_strategy_assets (
  merchant_id uuid primary key references public.merchant_profiles(id) on delete cascade,
  strategy_snapshot jsonb not null default '{}'::jsonb,
  strategy_markdown text not null default '',
  canonical_snapshot jsonb,
  compiled_context jsonb,
  source_session_id uuid references public.consultation_sessions(id) on delete set null,
  source_message_id uuid references public.consultation_messages(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint merchant_strategy_assets_snapshot_object_check check (jsonb_typeof(strategy_snapshot) = 'object'),
  constraint merchant_strategy_assets_canonical_object_check check (
    canonical_snapshot is null or jsonb_typeof(canonical_snapshot) = 'object'
  ),
  constraint merchant_strategy_assets_compiled_object_check check (
    compiled_context is null or jsonb_typeof(compiled_context) = 'object'
  )
);

create index if not exists idx_merchant_strategy_assets_source_session
on public.merchant_strategy_assets (source_session_id)
where source_session_id is not null;

drop trigger if exists trg_merchant_strategy_assets_updated_at on public.merchant_strategy_assets;
create trigger trg_merchant_strategy_assets_updated_at
before update on public.merchant_strategy_assets
for each row execute function public.set_updated_at();

insert into public.merchant_strategy_assets (
  merchant_id,
  strategy_snapshot,
  canonical_snapshot,
  source_session_id,
  created_at,
  updated_at
)
select distinct on (merchant_id)
  merchant_id,
  strategy_snapshot,
  strategy_snapshot,
  id,
  created_at,
  updated_at
from public.consultation_sessions
where strategy_snapshot is not null
  and strategy_snapshot <> '{}'::jsonb
order by merchant_id, last_message_at desc, updated_at desc
on conflict (merchant_id) do nothing;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'platform',
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  title text not null,
  source_name text,
  document_kind text not null default 'file',
  content_kind text not null default 'platform_method',
  storage_provider text,
  bucket_name text,
  storage_key text,
  mime_type text,
  status text not null default 'uploaded',
  summary_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint knowledge_documents_scope_check check (scope in ('platform', 'merchant')),
  constraint knowledge_documents_scope_merchant_check check (
    (scope = 'platform' and merchant_id is null)
    or (scope = 'merchant' and merchant_id is not null)
  ),
  constraint knowledge_documents_document_kind_check check (document_kind in ('file', 'memory', 'seed')),
  constraint knowledge_documents_content_kind_check check (
    content_kind in ('platform_method', 'merchant_document', 'merchant_memory')
  ),
  constraint knowledge_documents_storage_provider_check check (
    storage_provider is null or storage_provider in ('tencent_cos', 'supabase_storage')
  ),
  constraint knowledge_documents_status_check check (
    status in ('uploaded', 'queued', 'processing', 'indexed', 'failed', 'deleted')
  ),
  constraint knowledge_documents_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_knowledge_documents_scope_status_created_at
on public.knowledge_documents (scope, status, created_at desc);

create index if not exists idx_knowledge_documents_merchant_status_updated_at
on public.knowledge_documents (merchant_id, status, updated_at desc)
where merchant_id is not null;

create unique index if not exists ux_knowledge_documents_seed_key
on public.knowledge_documents ((metadata ->> 'seedKey'))
where metadata ? 'seedKey';

drop trigger if exists trg_knowledge_documents_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row execute function public.set_updated_at();

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding_model text,
  embedding_dimensions integer,
  embedding_json double precision[],
  created_at timestamptz not null default timezone('utc', now()),
  constraint knowledge_chunks_chunk_index_check check (chunk_index >= 0),
  constraint knowledge_chunks_token_count_check check (token_count >= 0),
  constraint knowledge_chunks_dimensions_check check (
    embedding_dimensions is null or embedding_dimensions > 0
  ),
  constraint knowledge_chunks_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists ux_knowledge_chunks_document_chunk_index
on public.knowledge_chunks (document_id, chunk_index);

create index if not exists idx_knowledge_chunks_document_chunk_index
on public.knowledge_chunks (document_id, chunk_index);

create index if not exists idx_knowledge_chunks_created_at
on public.knowledge_chunks (created_at desc);

create table if not exists public.knowledge_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.knowledge_documents(id) on delete cascade,
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  job_type text not null default 'document_ingestion',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  input_payload jsonb not null default '{}'::jsonb,
  log_payload jsonb not null default '{}'::jsonb,
  error_summary text,
  locked_by text,
  locked_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint knowledge_ingestion_jobs_type_check check (
    job_type in ('document_ingestion', 'reindex', 'embedding_refresh')
  ),
  constraint knowledge_ingestion_jobs_status_check check (
    status in ('pending', 'queued', 'processing', 'succeeded', 'failed')
  ),
  constraint knowledge_ingestion_jobs_attempt_check check (attempt_count >= 0),
  constraint knowledge_ingestion_jobs_max_attempts_check check (max_attempts >= 1),
  constraint knowledge_ingestion_jobs_input_object_check check (jsonb_typeof(input_payload) = 'object'),
  constraint knowledge_ingestion_jobs_log_object_check check (jsonb_typeof(log_payload) = 'object')
);

create index if not exists idx_knowledge_ingestion_jobs_status_created_at
on public.knowledge_ingestion_jobs (status, created_at asc);

create index if not exists idx_knowledge_ingestion_jobs_document_created_at
on public.knowledge_ingestion_jobs (document_id, created_at desc);

create index if not exists idx_knowledge_ingestion_jobs_merchant_status_created_at
on public.knowledge_ingestion_jobs (merchant_id, status, created_at desc);

drop trigger if exists trg_knowledge_ingestion_jobs_updated_at on public.knowledge_ingestion_jobs;
create trigger trg_knowledge_ingestion_jobs_updated_at
before update on public.knowledge_ingestion_jobs
for each row execute function public.set_updated_at();

create table if not exists public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  display_name text not null,
  role_description text,
  description text,
  service_status text not null default 'draft',
  service_flags jsonb not null default '{
    "systemPromptEnabled": true,
    "skillsEnabled": true,
    "knowledgeEnabled": true
  }'::jsonb,
  model_config jsonb not null default '{}'::jsonb,
  copied_from_agent_id uuid references public.agent_configs(id) on delete set null,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_configs_status_check check (service_status in ('draft', 'enabled', 'disabled')),
  constraint agent_configs_flags_object_check check (jsonb_typeof(service_flags) = 'object'),
  constraint agent_configs_model_config_object_check check (jsonb_typeof(model_config) = 'object')
);

create unique index if not exists ux_agent_configs_agent_key
on public.agent_configs (agent_key);

create index if not exists idx_agent_configs_status_created_at
on public.agent_configs (service_status, created_at desc);

drop trigger if exists trg_agent_configs_updated_at on public.agent_configs;
create trigger trg_agent_configs_updated_at
before update on public.agent_configs
for each row execute function public.set_updated_at();

create table if not exists public.agent_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_configs(id) on delete cascade,
  version_no integer not null,
  body text not null default '',
  status text not null default 'draft',
  change_note text,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  activated_at timestamptz,
  archived_at timestamptz,
  constraint agent_prompt_versions_version_check check (version_no >= 1),
  constraint agent_prompt_versions_status_check check (status in ('draft', 'active', 'archived'))
);

create unique index if not exists ux_agent_prompt_versions_agent_version
on public.agent_prompt_versions (agent_id, version_no);

create unique index if not exists ux_agent_prompt_versions_one_active
on public.agent_prompt_versions (agent_id)
where status = 'active';

create unique index if not exists ux_agent_prompt_versions_one_draft
on public.agent_prompt_versions (agent_id)
where status = 'draft';

create index if not exists idx_agent_prompt_versions_agent_created_at
on public.agent_prompt_versions (agent_id, created_at desc);

create table if not exists public.agent_soul_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_configs(id) on delete cascade,
  version_no integer not null,
  body text not null default '',
  status text not null default 'draft',
  change_note text,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  activated_at timestamptz,
  archived_at timestamptz,
  constraint agent_soul_versions_version_check check (version_no >= 1),
  constraint agent_soul_versions_status_check check (status in ('draft', 'active', 'archived'))
);

create unique index if not exists ux_agent_soul_versions_agent_version
on public.agent_soul_versions (agent_id, version_no);

create unique index if not exists ux_agent_soul_versions_one_active
on public.agent_soul_versions (agent_id)
where status = 'active';

create unique index if not exists ux_agent_soul_versions_one_draft
on public.agent_soul_versions (agent_id)
where status = 'draft';

create index if not exists idx_agent_soul_versions_agent_created_at
on public.agent_soul_versions (agent_id, created_at desc);

create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  skill_key text,
  name text not null,
  description text not null default '',
  when_to_use text not null default '',
  body text not null default '',
  status text not null default 'draft',
  dependencies jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_skills_status_check check (status in ('draft', 'enabled', 'disabled')),
  constraint agent_skills_dependencies_array_check check (jsonb_typeof(dependencies) = 'array'),
  constraint agent_skills_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists ux_agent_skills_skill_key
on public.agent_skills (skill_key);

create unique index if not exists ux_agent_skills_lower_name
on public.agent_skills (lower(name));

create index if not exists idx_agent_skills_status_created_at
on public.agent_skills (status, created_at desc);

drop trigger if exists trg_agent_skills_updated_at on public.agent_skills;
create trigger trg_agent_skills_updated_at
before update on public.agent_skills
for each row execute function public.set_updated_at();

create table if not exists public.agent_skill_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_configs(id) on delete cascade,
  skill_id uuid not null references public.agent_skills(id) on delete cascade,
  status text not null default 'enabled',
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_skill_bindings_status_check check (status in ('enabled', 'disabled'))
);

create unique index if not exists ux_agent_skill_bindings_agent_skill
on public.agent_skill_bindings (agent_id, skill_id);

create index if not exists idx_agent_skill_bindings_skill_id
on public.agent_skill_bindings (skill_id);

drop trigger if exists trg_agent_skill_bindings_updated_at on public.agent_skill_bindings;
create trigger trg_agent_skill_bindings_updated_at
before update on public.agent_skill_bindings
for each row execute function public.set_updated_at();

create table if not exists public.knowledge_sets (
  id uuid primary key default gen_random_uuid(),
  set_key text,
  name text not null,
  description text,
  scope text not null default 'platform',
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint knowledge_sets_scope_check check (scope in ('platform', 'merchant')),
  constraint knowledge_sets_status_check check (status in ('draft', 'enabled', 'disabled')),
  constraint knowledge_sets_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint knowledge_sets_scope_merchant_check check (
    (scope = 'platform' and merchant_id is null)
    or (scope = 'merchant' and merchant_id is not null)
  )
);

create unique index if not exists ux_knowledge_sets_set_key
on public.knowledge_sets (set_key);

create index if not exists idx_knowledge_sets_scope_status_created_at
on public.knowledge_sets (scope, status, created_at desc);

drop trigger if exists trg_knowledge_sets_updated_at on public.knowledge_sets;
create trigger trg_knowledge_sets_updated_at
before update on public.knowledge_sets
for each row execute function public.set_updated_at();

create table if not exists public.knowledge_set_documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_set_id uuid not null references public.knowledge_sets(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ux_knowledge_set_documents_set_document
on public.knowledge_set_documents (knowledge_set_id, document_id);

create index if not exists idx_knowledge_set_documents_document_id
on public.knowledge_set_documents (document_id);

create table if not exists public.agent_knowledge_set_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_configs(id) on delete cascade,
  knowledge_set_id uuid not null references public.knowledge_sets(id) on delete cascade,
  status text not null default 'enabled',
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_knowledge_set_bindings_status_check check (status in ('enabled', 'disabled'))
);

create unique index if not exists ux_agent_knowledge_set_bindings_agent_set
on public.agent_knowledge_set_bindings (agent_id, knowledge_set_id);

create index if not exists idx_agent_knowledge_set_bindings_set_id
on public.agent_knowledge_set_bindings (knowledge_set_id);

drop trigger if exists trg_agent_knowledge_set_bindings_updated_at on public.agent_knowledge_set_bindings;
create trigger trg_agent_knowledge_set_bindings_updated_at
before update on public.agent_knowledge_set_bindings
for each row execute function public.set_updated_at();

create table if not exists public.agent_route_bindings (
  id uuid primary key default gen_random_uuid(),
  route_key text not null,
  agent_id uuid references public.agent_configs(id) on delete set null,
  status text not null default 'active',
  description text,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_route_bindings_route_key_check check (route_key in ('consultation_default')),
  constraint agent_route_bindings_status_check check (status in ('active', 'disabled'))
);

create unique index if not exists ux_agent_route_bindings_route_key
on public.agent_route_bindings (route_key);

create index if not exists idx_agent_route_bindings_agent_id
on public.agent_route_bindings (agent_id);

drop trigger if exists trg_agent_route_bindings_updated_at on public.agent_route_bindings;
create trigger trg_agent_route_bindings_updated_at
before update on public.agent_route_bindings
for each row execute function public.set_updated_at();

create table if not exists public.agent_test_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agent_configs(id) on delete set null,
  merchant_id uuid references public.merchant_profiles(id) on delete set null,
  input_message text not null,
  prompt_version_id uuid references public.agent_prompt_versions(id) on delete set null,
  candidate_skill_ids jsonb not null default '[]'::jsonb,
  actual_skill_ids jsonb not null default '[]'::jsonb,
  knowledge_set_ids jsonb not null default '[]'::jsonb,
  knowledge_match_ids jsonb not null default '[]'::jsonb,
  memory_match_ids jsonb not null default '[]'::jsonb,
  tool_summary jsonb not null default '{}'::jsonb,
  assistant_output text,
  status text not null default 'succeeded',
  error_summary text,
  model text,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint agent_test_runs_status_check check (status in ('succeeded', 'failed')),
  constraint agent_test_runs_candidate_skill_ids_array_check check (jsonb_typeof(candidate_skill_ids) = 'array'),
  constraint agent_test_runs_actual_skill_ids_array_check check (jsonb_typeof(actual_skill_ids) = 'array'),
  constraint agent_test_runs_knowledge_set_ids_array_check check (jsonb_typeof(knowledge_set_ids) = 'array'),
  constraint agent_test_runs_knowledge_match_ids_array_check check (jsonb_typeof(knowledge_match_ids) = 'array'),
  constraint agent_test_runs_memory_match_ids_array_check check (jsonb_typeof(memory_match_ids) = 'array'),
  constraint agent_test_runs_tool_summary_object_check check (jsonb_typeof(tool_summary) = 'object')
);

create index if not exists idx_agent_test_runs_agent_created_at
on public.agent_test_runs (agent_id, created_at desc);

create index if not exists idx_agent_test_runs_merchant_created_at
on public.agent_test_runs (merchant_id, created_at desc);

create table if not exists public.agent_runtime_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.consultation_sessions(id) on delete cascade,
  message_id uuid references public.consultation_messages(id) on delete cascade,
  agent_id uuid references public.agent_configs(id) on delete set null,
  prompt_version_id uuid references public.agent_prompt_versions(id) on delete set null,
  soul_version_id uuid references public.agent_soul_versions(id) on delete set null,
  candidate_skill_ids jsonb not null default '[]'::jsonb,
  actual_skill_ids jsonb not null default '[]'::jsonb,
  knowledge_set_ids jsonb not null default '[]'::jsonb,
  knowledge_match_ids jsonb not null default '[]'::jsonb,
  memory_match_ids jsonb not null default '[]'::jsonb,
  tool_call_summary jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint agent_runtime_snapshots_candidate_skill_ids_array_check check (jsonb_typeof(candidate_skill_ids) = 'array'),
  constraint agent_runtime_snapshots_actual_skill_ids_array_check check (jsonb_typeof(actual_skill_ids) = 'array'),
  constraint agent_runtime_snapshots_knowledge_set_ids_array_check check (jsonb_typeof(knowledge_set_ids) = 'array'),
  constraint agent_runtime_snapshots_knowledge_match_ids_array_check check (jsonb_typeof(knowledge_match_ids) = 'array'),
  constraint agent_runtime_snapshots_memory_match_ids_array_check check (jsonb_typeof(memory_match_ids) = 'array'),
  constraint agent_runtime_snapshots_tool_call_summary_object_check check (jsonb_typeof(tool_call_summary) = 'object')
);

create index if not exists idx_agent_runtime_snapshots_session_created_at
on public.agent_runtime_snapshots (session_id, created_at desc);

create index if not exists idx_agent_runtime_snapshots_message_id
on public.agent_runtime_snapshots (message_id);

create table if not exists public.material_workbench_references (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  material_item_id uuid not null references public.source_items(id) on delete cascade,
  target_workbench text not null,
  status text not null default 'pending',
  created_by_user_id uuid references public.app_users(id) on delete set null,
  draft_id uuid references public.content_drafts(id) on delete set null,
  trace_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  consumed_at timestamptz,
  constraint material_workbench_references_target_check check (target_workbench in ('article', 'video')),
  constraint material_workbench_references_status_check check (status in ('pending', 'consumed')),
  constraint material_workbench_references_trace_object_check check (jsonb_typeof(trace_payload) = 'object')
);

create index if not exists idx_material_workbench_refs_merchant_created_at
on public.material_workbench_references (merchant_id, created_at desc);

create index if not exists idx_material_workbench_refs_material_status
on public.material_workbench_references (material_item_id, status, created_at desc);

create index if not exists idx_material_workbench_refs_draft_id
on public.material_workbench_references (draft_id)
where draft_id is not null;

insert into public.platform_settings (key, category, value, description)
values
  (
    'llm_runtime',
    'llm',
    '{
      "providerLabel": "OpenAI Compatible",
      "baseUrl": "https://api.openai.com/v1",
      "primaryModel": "gpt-4.1",
      "fallbackModel": "gpt-4.1-mini",
      "temperature": 0.7,
      "maxTokens": 1800,
      "timeoutSeconds": 45,
      "retryCount": 2
    }'::jsonb,
    'Platform-level LLM runtime defaults.'
  ),
  (
    'import_runtime',
    'import',
    '{
      "importProvider": "apify",
      "defaultMaxComments": 30,
      "defaultCreatorPosts": 20,
      "waitSeconds": 120
    }'::jsonb,
    'Platform-level import runtime defaults.'
  ),
  (
    'membership_plans',
    'membership',
    '{
      "free": { "dailyCredits": 20 },
      "plus": { "dailyCredits": 100 },
      "pro": { "dailyCredits": 300 },
      "max": { "dailyCredits": 1000 }
    }'::jsonb,
    'Membership plan defaults.'
  ),
  (
    'consultation_agent',
    'consultation',
    '{
      "systemPrompt": "You are the default business consultation agent for local service merchants.",
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
    'Default consultation agent settings.'
  ),
  (
    'script_production_agent',
    'script_production',
    '{
      "model": "gpt-4.1-mini",
      "temperature": 0.6,
      "maxRounds": 4
    }'::jsonb,
    'Default script production agent settings.'
  ),
  (
    'knowledge_runtime',
    'knowledge',
    '{
      "retrievalTopK": 5,
      "chunkSize": 900,
      "chunkOverlap": 120,
      "embeddingModel": "text-embedding-3-small",
      "embeddingDimensions": 1536,
      "queryRewriteEnabled": true
    }'::jsonb,
    'Default knowledge retrieval runtime settings.'
  )
on conflict (key) do nothing;

insert into public.knowledge_sets (
  set_key,
  name,
  description,
  scope,
  status,
  metadata
)
values (
  'base_platform_knowledge',
  'Base Platform Knowledge',
  'Default platform knowledge set for the initial consultation agent.',
  'platform',
  'enabled',
  '{"seededBy": "202605160001_selfhost_p0_foundation"}'::jsonb
)
on conflict (set_key) do nothing;

insert into public.knowledge_set_documents (knowledge_set_id, document_id)
select ks.id, kd.id
from public.knowledge_sets ks
cross join public.knowledge_documents kd
where ks.set_key = 'base_platform_knowledge'
  and kd.scope = 'platform'
  and kd.status <> 'deleted'
on conflict (knowledge_set_id, document_id) do nothing;

insert into public.agent_configs (
  agent_key,
  display_name,
  role_description,
  description,
  service_status,
  service_flags,
  model_config
)
values (
  'initial_consultation_agent',
  'Initial Consultation Agent',
  'Local service merchant consultation advisor.',
  'Seeded by the self-hosted PostgreSQL P0 foundation migration.',
  'enabled',
  '{
    "systemPromptEnabled": true,
    "skillsEnabled": true,
    "knowledgeEnabled": true
  }'::jsonb,
  '{}'::jsonb
)
on conflict (agent_key) do nothing;

insert into public.agent_prompt_versions (
  agent_id,
  version_no,
  body,
  status,
  change_note,
  activated_at
)
select
  ac.id,
  1,
  coalesce(
    nullif(ps.value ->> 'systemPrompt', ''),
    'You are the default business consultation agent for local service merchants.'
  ),
  'active',
  'Initial self-hosted foundation prompt.',
  timezone('utc', now())
from public.agent_configs ac
left join public.platform_settings ps on ps.key = 'consultation_agent'
where ac.agent_key = 'initial_consultation_agent'
  and not exists (
    select 1
    from public.agent_prompt_versions apv
    where apv.agent_id = ac.id
      and apv.status = 'active'
  );

insert into public.agent_soul_versions (
  agent_id,
  version_no,
  body,
  status,
  change_note,
  activated_at
)
select
  ac.id,
  1,
  '',
  'active',
  'Initial self-hosted foundation soul.',
  timezone('utc', now())
from public.agent_configs ac
where ac.agent_key = 'initial_consultation_agent'
  and not exists (
    select 1
    from public.agent_soul_versions asv
    where asv.agent_id = ac.id
      and asv.status = 'active'
  );

insert into public.agent_knowledge_set_bindings (
  agent_id,
  knowledge_set_id,
  status
)
select ac.id, ks.id, 'enabled'
from public.agent_configs ac
join public.knowledge_sets ks on ks.set_key = 'base_platform_knowledge'
where ac.agent_key = 'initial_consultation_agent'
on conflict (agent_id, knowledge_set_id) do nothing;

insert into public.agent_route_bindings (
  route_key,
  agent_id,
  status,
  description
)
select
  'consultation_default',
  ac.id,
  'active',
  'Default merchant consultation route.'
from public.agent_configs ac
where ac.agent_key = 'initial_consultation_agent'
on conflict (route_key) do nothing;
