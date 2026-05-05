-- Agent soul.md versions
-- Adds a versioned personality/tone layer for each consultation Agent.

create table if not exists public.agent_soul_versions (
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

alter table public.agent_soul_versions enable row level security;
