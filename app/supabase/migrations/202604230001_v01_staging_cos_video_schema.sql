alter table public.asset_objects
drop constraint if exists asset_objects_owner_type_check;

alter table public.asset_objects
drop constraint if exists asset_objects_asset_type_check;

alter table public.asset_objects
add column if not exists storage_provider text not null default 'supabase_storage',
add column if not exists bucket_name text,
add column if not exists file_size_bytes bigint,
add column if not exists etag text,
add column if not exists updated_at timestamptz not null default now();

update public.asset_objects
set storage_provider = 'supabase_storage'
where storage_provider is null;

alter table public.asset_objects
add constraint asset_objects_owner_type_check
check (owner_type in ('source_item', 'content_draft', 'content_variant'));

alter table public.asset_objects
add constraint asset_objects_asset_type_check
check (asset_type in ('image', 'video', 'cover', 'subtitle'));

drop policy if exists asset_objects_owner_read on public.asset_objects;

create policy asset_objects_owner_read
on public.asset_objects for select
using (
  (
    owner_type = 'source_item'
    and owner_id in (
      select si.id
      from public.source_items si
      join public.merchant_profiles mp on mp.id = si.merchant_id
      where mp.owner_user_id = auth.uid()
    )
  )
  or (
    owner_type = 'content_draft'
    and owner_id in (
      select cd.id
      from public.content_drafts cd
      join public.merchant_profiles mp on mp.id = cd.merchant_id
      where mp.owner_user_id = auth.uid()
    )
  )
  or (
    owner_type = 'content_variant'
    and owner_id in (
      select cv.id
      from public.content_variants cv
      join public.content_drafts cd on cd.id = cv.draft_id
      join public.merchant_profiles mp on mp.id = cd.merchant_id
      where mp.owner_user_id = auth.uid()
    )
  )
);

drop trigger if exists trg_asset_objects_updated_at on public.asset_objects;

create trigger trg_asset_objects_updated_at
before update on public.asset_objects
for each row execute function public.set_updated_at();

create table public.video_edit_jobs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  draft_id uuid not null references public.content_drafts(id) on delete cascade,
  content_variant_id uuid not null references public.content_variants(id) on delete cascade,
  status text not null default 'pending',
  current_stage text,
  trigger_source text not null default 'manual',
  instruction_text text,
  input_payload jsonb not null default '{}'::jsonb,
  runtime_payload jsonb not null default '{}'::jsonb,
  progress_pct integer not null default 0,
  retry_count integer not null default 0,
  failure_reason text,
  result_payload jsonb not null default '{}'::jsonb,
  log_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status in (
      'pending',
      'queued',
      'preparing',
      'running',
      'succeeded',
      'failed_retryable',
      'failed_manual',
      'cancelled'
    )
  ),
  check (trigger_source in ('manual', 'regenerate', 'agent_auto')),
  check (progress_pct between 0 and 100),
  check (retry_count >= 0)
);

create index idx_video_edit_jobs_merchant_status_created_at
on public.video_edit_jobs (merchant_id, status, created_at desc);

create index idx_video_edit_jobs_variant_created_at
on public.video_edit_jobs (content_variant_id, created_at desc);

create index idx_video_edit_jobs_status_created_at
on public.video_edit_jobs (status, created_at asc);

create trigger trg_video_edit_jobs_updated_at
before update on public.video_edit_jobs
for each row execute function public.set_updated_at();

alter table public.video_edit_jobs enable row level security;

create policy video_edit_jobs_owner_read
on public.video_edit_jobs for select
using (
  merchant_id in (
    select mp.id
    from public.merchant_profiles mp
    where mp.owner_user_id = auth.uid()
  )
);
