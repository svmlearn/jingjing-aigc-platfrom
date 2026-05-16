-- V2.4 Dify content generation batch/job queue

create table if not exists public.content_generation_batches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'daily_task',
  calendar_snapshot jsonb not null default '{}'::jsonb,
  member_scope_snapshot jsonb not null default '{}'::jsonb,
  total_jobs integer not null default 0,
  succeeded_jobs integer not null default 0,
  failed_jobs integer not null default 0,
  running_jobs integer not null default 0,
  status text not null default 'pending',
  workflow_provider text not null default 'dify',
  workflow_version text not null default 'v3.1',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in ('consultation_calendar', 'manual_calendar', 'campaign', 'daily_task')),
  check (status in ('pending', 'running', 'completed', 'completed_with_errors', 'canceled')),
  check (workflow_provider in ('dify', 'langgraph')),
  check (total_jobs >= 0),
  check (succeeded_jobs >= 0),
  check (failed_jobs >= 0),
  check (running_jobs >= 0),
  check (jsonb_typeof(calendar_snapshot) = 'object'),
  check (jsonb_typeof(member_scope_snapshot) = 'object')
);

create table if not exists public.content_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.content_generation_batches(id) on delete cascade,
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  daily_task_id uuid not null references public.daily_content_tasks(id) on delete cascade,
  task_date date not null,
  calendar_item_id text,
  idempotency_key text not null,
  status text not null default 'pending',
  current_stage text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 2,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_json jsonb,
  quality_review jsonb,
  error_message text,
  workflow_provider text not null default 'dify',
  workflow_version text not null default 'v3.1',
  dify_workflow_run_id text,
  content_draft_id uuid references public.content_drafts(id) on delete set null,
  article_variant_id uuid references public.content_variants(id) on delete set null,
  video_variant_id uuid references public.content_variants(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status in (
      'pending',
      'running',
      'succeeded',
      'failed_retryable',
      'failed_manual',
      'canceled'
    )
  ),
  check (workflow_provider in ('dify', 'langgraph')),
  check (attempt_count >= 0),
  check (max_attempts >= 1),
  check (jsonb_typeof(input_snapshot) = 'object'),
  check (output_json is null or jsonb_typeof(output_json) = 'object'),
  check (quality_review is null or jsonb_typeof(quality_review) = 'object')
);

create index if not exists idx_content_generation_batches_merchant_created
on public.content_generation_batches (merchant_id, created_at desc);

create index if not exists idx_content_generation_jobs_batch_status
on public.content_generation_jobs (batch_id, status);

create index if not exists idx_content_generation_jobs_queue
on public.content_generation_jobs (workflow_provider, status, created_at);

create index if not exists idx_content_generation_jobs_member_task
on public.content_generation_jobs (member_user_id, daily_task_id, created_at desc);

create index if not exists idx_content_generation_jobs_idempotency
on public.content_generation_jobs (idempotency_key);

drop trigger if exists trg_content_generation_batches_updated_at on public.content_generation_batches;
create trigger trg_content_generation_batches_updated_at
before update on public.content_generation_batches
for each row execute function public.set_updated_at();

drop trigger if exists trg_content_generation_jobs_updated_at on public.content_generation_jobs;
create trigger trg_content_generation_jobs_updated_at
before update on public.content_generation_jobs
for each row execute function public.set_updated_at();

alter table public.content_generation_batches enable row level security;
alter table public.content_generation_jobs enable row level security;

drop policy if exists content_generation_batches_select_team on public.content_generation_batches;
create policy content_generation_batches_select_team
on public.content_generation_batches for select
using (
  exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = content_generation_batches.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);

drop policy if exists content_generation_jobs_select_member_or_owner on public.content_generation_jobs;
create policy content_generation_jobs_select_member_or_owner
on public.content_generation_jobs for select
using (
  member_user_id = auth.uid()
  or exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = content_generation_jobs.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
      and mtm.role = 'owner'
  )
);
