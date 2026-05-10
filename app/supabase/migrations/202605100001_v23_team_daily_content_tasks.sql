-- V2.3 team content calendar and member daily tasks

create table if not exists public.merchant_team_members (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  display_name text,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('owner', 'member')),
  check (status in ('active', 'disabled'))
);

create unique index if not exists ux_merchant_team_members_user_id
on public.merchant_team_members (user_id);

create index if not exists idx_merchant_team_members_merchant_role
on public.merchant_team_members (merchant_id, role, status);

insert into public.merchant_team_members (
  merchant_id,
  user_id,
  role,
  status,
  display_name,
  created_at,
  updated_at
)
select
  id,
  owner_user_id,
  'owner',
  'active',
  name,
  now(),
  now()
from public.merchant_profiles
where owner_user_id is not null
on conflict (user_id) do nothing;

create table if not exists public.daily_content_tasks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  theme text not null,
  team_calendar_source jsonb not null default '{}'::jsonb,
  article_task jsonb not null default '{}'::jsonb,
  video_task jsonb not null default '{}'::jsonb,
  knowledge_refs jsonb not null default '[]'::jsonb,
  material_refs jsonb not null default '[]'::jsonb,
  status text not null default 'generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('generated', 'claimed', 'article_created', 'video_script_created', 'archived')),
  check (jsonb_typeof(team_calendar_source) = 'object'),
  check (jsonb_typeof(article_task) = 'object'),
  check (jsonb_typeof(video_task) = 'object'),
  check (jsonb_typeof(knowledge_refs) = 'array'),
  check (jsonb_typeof(material_refs) = 'array')
);

create unique index if not exists ux_daily_content_tasks_merchant_user_date
on public.daily_content_tasks (merchant_id, user_id, task_date);

create index if not exists idx_daily_content_tasks_merchant_date
on public.daily_content_tasks (merchant_id, task_date);

drop trigger if exists trg_merchant_team_members_updated_at on public.merchant_team_members;
create trigger trg_merchant_team_members_updated_at
before update on public.merchant_team_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_daily_content_tasks_updated_at on public.daily_content_tasks;
create trigger trg_daily_content_tasks_updated_at
before update on public.daily_content_tasks
for each row execute function public.set_updated_at();

alter table public.merchant_team_members enable row level security;
alter table public.daily_content_tasks enable row level security;

drop policy if exists merchant_team_members_select_self_or_owner on public.merchant_team_members;
create policy merchant_team_members_select_self_or_owner
on public.merchant_team_members for select
using (
  user_id = auth.uid()
  or merchant_id in (
    select mtm.merchant_id
    from public.merchant_team_members mtm
    where mtm.user_id = auth.uid()
      and mtm.role = 'owner'
      and mtm.status = 'active'
  )
);

drop policy if exists daily_content_tasks_select_member on public.daily_content_tasks;
create policy daily_content_tasks_select_member
on public.daily_content_tasks for select
using (
  user_id = auth.uid()
  or merchant_id in (
    select mtm.merchant_id
    from public.merchant_team_members mtm
    where mtm.user_id = auth.uid()
      and mtm.role = 'owner'
      and mtm.status = 'active'
  )
);

