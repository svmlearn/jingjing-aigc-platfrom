-- V2.2 Agent console foundation
-- Scope:
-- - platform admin account identity table
-- - Agent container / prompt version / skill / knowledge set bindings
-- - route binding for consultation_default
-- - test run and runtime snapshot persistence
-- - lightweight membership / credit / usage event reservation

create extension if not exists pgcrypto;

create table if not exists public.platform_admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'admin',
  status text not null default 'active',
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('super_admin', 'admin')),
  check (status in ('active', 'disabled')),
  check (position('@' in email) > 1)
);

create unique index if not exists ux_platform_admin_users_auth_user_id
on public.platform_admin_users (auth_user_id);

create unique index if not exists ux_platform_admin_users_lower_email
on public.platform_admin_users (lower(email));

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_status in ('draft', 'enabled', 'disabled')),
  check (jsonb_typeof(service_flags) = 'object'),
  check (jsonb_typeof(model_config) = 'object')
);

create unique index if not exists ux_agent_configs_agent_key
on public.agent_configs (agent_key);

create index if not exists idx_agent_configs_status_created_at
on public.agent_configs (service_status, created_at desc);

create table if not exists public.agent_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_configs(id) on delete cascade,
  version_no integer not null,
  body text not null default '',
  status text not null default 'draft',
  change_note text,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  check (version_no >= 1),
  check (status in ('draft', 'active', 'archived'))
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'enabled', 'disabled')),
  check (jsonb_typeof(dependencies) = 'array'),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists ux_agent_skills_skill_key
on public.agent_skills (skill_key);

create unique index if not exists ux_agent_skills_lower_name
on public.agent_skills (lower(name));

create index if not exists idx_agent_skills_status_created_at
on public.agent_skills (status, created_at desc);

create table if not exists public.agent_skill_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_configs(id) on delete cascade,
  skill_id uuid not null references public.agent_skills(id) on delete cascade,
  status text not null default 'enabled',
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('enabled', 'disabled'))
);

create unique index if not exists ux_agent_skill_bindings_agent_skill
on public.agent_skill_bindings (agent_id, skill_id);

create index if not exists idx_agent_skill_bindings_skill_id
on public.agent_skill_bindings (skill_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope in ('platform', 'merchant')),
  check (status in ('draft', 'enabled', 'disabled')),
  check (jsonb_typeof(metadata) = 'object'),
  check (
    (scope = 'platform' and merchant_id is null)
    or (scope = 'merchant' and merchant_id is not null)
  )
);

create unique index if not exists ux_knowledge_sets_set_key
on public.knowledge_sets (set_key);

create index if not exists idx_knowledge_sets_scope_status_created_at
on public.knowledge_sets (scope, status, created_at desc);

create table if not exists public.knowledge_set_documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_set_id uuid not null references public.knowledge_sets(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('enabled', 'disabled'))
);

create unique index if not exists ux_agent_knowledge_set_bindings_agent_set
on public.agent_knowledge_set_bindings (agent_id, knowledge_set_id);

create index if not exists idx_agent_knowledge_set_bindings_set_id
on public.agent_knowledge_set_bindings (knowledge_set_id);

create table if not exists public.agent_route_bindings (
  id uuid primary key default gen_random_uuid(),
  route_key text not null,
  agent_id uuid references public.agent_configs(id) on delete set null,
  status text not null default 'active',
  description text,
  created_by_admin_id uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (route_key in ('consultation_default')),
  check (status in ('active', 'disabled'))
);

create unique index if not exists ux_agent_route_bindings_route_key
on public.agent_route_bindings (route_key);

create index if not exists idx_agent_route_bindings_agent_id
on public.agent_route_bindings (agent_id);

create table if not exists public.merchant_memberships (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  tier text not null default 'free',
  status text not null default 'trial',
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tier in ('free', 'plus', 'pro', 'max')),
  check (status in ('trial', 'active', 'expired', 'cancelled')),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists ux_merchant_memberships_merchant_id
on public.merchant_memberships (merchant_id);

create table if not exists public.merchant_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  balance integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (balance >= 0),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists ux_merchant_credit_accounts_merchant_id
on public.merchant_credit_accounts (merchant_id);

create table if not exists public.merchant_usage_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  action_type text not null,
  agent_id uuid references public.agent_configs(id) on delete set null,
  estimated_cost integer,
  actual_cost integer,
  status text not null default 'reserved',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (status in ('reserved', 'consumed', 'failed', 'refunded', 'skipped')),
  check (estimated_cost is null or estimated_cost >= 0),
  check (actual_cost is null or actual_cost >= 0),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_merchant_usage_events_merchant_created_at
on public.merchant_usage_events (merchant_id, created_at desc);

create index if not exists idx_merchant_usage_events_agent_created_at
on public.merchant_usage_events (agent_id, created_at desc);

create table if not exists public.merchant_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  credit_account_id uuid references public.merchant_credit_accounts(id) on delete set null,
  direction text not null,
  amount integer not null,
  reason text not null,
  related_usage_event_id uuid references public.merchant_usage_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (direction in ('grant', 'consume', 'refund', 'adjust', 'expire')),
  check (amount > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_merchant_credit_ledger_merchant_created_at
on public.merchant_credit_ledger (merchant_id, created_at desc);

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
  created_at timestamptz not null default now(),
  check (status in ('succeeded', 'failed')),
  check (jsonb_typeof(candidate_skill_ids) = 'array'),
  check (jsonb_typeof(actual_skill_ids) = 'array'),
  check (jsonb_typeof(knowledge_set_ids) = 'array'),
  check (jsonb_typeof(knowledge_match_ids) = 'array'),
  check (jsonb_typeof(memory_match_ids) = 'array'),
  check (jsonb_typeof(tool_summary) = 'object')
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
  candidate_skill_ids jsonb not null default '[]'::jsonb,
  actual_skill_ids jsonb not null default '[]'::jsonb,
  knowledge_set_ids jsonb not null default '[]'::jsonb,
  knowledge_match_ids jsonb not null default '[]'::jsonb,
  memory_match_ids jsonb not null default '[]'::jsonb,
  tool_call_summary jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(candidate_skill_ids) = 'array'),
  check (jsonb_typeof(actual_skill_ids) = 'array'),
  check (jsonb_typeof(knowledge_set_ids) = 'array'),
  check (jsonb_typeof(knowledge_match_ids) = 'array'),
  check (jsonb_typeof(memory_match_ids) = 'array'),
  check (jsonb_typeof(tool_call_summary) = 'object')
);

create index if not exists idx_agent_runtime_snapshots_session_created_at
on public.agent_runtime_snapshots (session_id, created_at desc);

create index if not exists idx_agent_runtime_snapshots_message_id
on public.agent_runtime_snapshots (message_id);

drop trigger if exists trg_platform_admin_users_updated_at on public.platform_admin_users;
create trigger trg_platform_admin_users_updated_at
before update on public.platform_admin_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_configs_updated_at on public.agent_configs;
create trigger trg_agent_configs_updated_at
before update on public.agent_configs
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_skills_updated_at on public.agent_skills;
create trigger trg_agent_skills_updated_at
before update on public.agent_skills
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_skill_bindings_updated_at on public.agent_skill_bindings;
create trigger trg_agent_skill_bindings_updated_at
before update on public.agent_skill_bindings
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_sets_updated_at on public.knowledge_sets;
create trigger trg_knowledge_sets_updated_at
before update on public.knowledge_sets
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_knowledge_set_bindings_updated_at on public.agent_knowledge_set_bindings;
create trigger trg_agent_knowledge_set_bindings_updated_at
before update on public.agent_knowledge_set_bindings
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_route_bindings_updated_at on public.agent_route_bindings;
create trigger trg_agent_route_bindings_updated_at
before update on public.agent_route_bindings
for each row execute function public.set_updated_at();

drop trigger if exists trg_merchant_memberships_updated_at on public.merchant_memberships;
create trigger trg_merchant_memberships_updated_at
before update on public.merchant_memberships
for each row execute function public.set_updated_at();

drop trigger if exists trg_merchant_credit_accounts_updated_at on public.merchant_credit_accounts;
create trigger trg_merchant_credit_accounts_updated_at
before update on public.merchant_credit_accounts
for each row execute function public.set_updated_at();

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
  '基础平台知识集',
  'V2.2 Agent 控制台初始化的默认平台知识集。',
  'platform',
  'enabled',
  '{"seededBy": "202604270001_v22_agent_console_foundation"}'::jsonb
)
on conflict (set_key) do nothing;

insert into public.knowledge_set_documents (knowledge_set_id, document_id)
select ks.id, kd.id
from public.knowledge_sets ks
cross join public.knowledge_documents kd
where ks.set_key = 'base_platform_knowledge'
  and kd.scope = 'platform'
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
select
  'initial_consultation_agent',
  '初始咨询 Agent',
  '本地生活商家内容咨询顾问',
  '由 V2.2 Agent 控制台 foundation migration 初始化，承接旧版 consultation_agent 配置。',
  'enabled',
  '{
    "systemPromptEnabled": true,
    "skillsEnabled": true,
    "knowledgeEnabled": true
  }'::jsonb,
  '{}'::jsonb
where not exists (
  select 1
  from public.agent_route_bindings rb
  join public.agent_configs ac on ac.id = rb.agent_id
  where rb.route_key = 'consultation_default'
    and rb.status = 'active'
    and ac.service_status in ('enabled', 'draft', 'disabled')
)
and not exists (
  select 1
  from public.agent_configs ac
  where ac.agent_key = 'initial_consultation_agent'
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
    '你是静境商家平台里的 AI 商业顾问。目标是帮助本地生活商家快速沉淀定位、卖点、目标客群、关键场景、内容策略和一周内容日历，并把结论转成后续图文与视频创作输入。'
  ),
  'active',
  'V2.2 初始化：从 platform_settings.consultation_agent.systemPrompt 迁移。',
  now()
from public.agent_configs ac
left join public.platform_settings ps on ps.key = 'consultation_agent'
where ac.agent_key = 'initial_consultation_agent'
  and not exists (
    select 1
    from public.agent_prompt_versions apv
    where apv.agent_id = ac.id
      and apv.status = 'active'
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
  '商家端默认咨询入口绑定。'
from public.agent_configs ac
where ac.agent_key = 'initial_consultation_agent'
  and not exists (
    select 1
    from public.agent_route_bindings rb
    where rb.route_key = 'consultation_default'
  )
on conflict (route_key) do nothing;

alter table public.platform_admin_users enable row level security;
alter table public.agent_configs enable row level security;
alter table public.agent_prompt_versions enable row level security;
alter table public.agent_skills enable row level security;
alter table public.agent_skill_bindings enable row level security;
alter table public.knowledge_sets enable row level security;
alter table public.knowledge_set_documents enable row level security;
alter table public.agent_knowledge_set_bindings enable row level security;
alter table public.agent_route_bindings enable row level security;
alter table public.agent_test_runs enable row level security;
alter table public.agent_runtime_snapshots enable row level security;
alter table public.merchant_memberships enable row level security;
alter table public.merchant_credit_accounts enable row level security;
alter table public.merchant_credit_ledger enable row level security;
alter table public.merchant_usage_events enable row level security;
