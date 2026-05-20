create table if not exists public.merchant_media_assets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  media_type text not null,
  source text not null,
  source_cos_key text not null,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  status text not null default 'uploaded',
  failure_reason text,
  processing_trace_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (media_type in ('image', 'video')),
  check (source in ('merchant_upload', 'merchant_confirmed')),
  check (
    status in (
      'uploaded',
      'validating',
      'processing',
      'tagging',
      'ready',
      'validation_failed',
      'processing_failed',
      'tagging_failed',
      'needs_reclip',
      'needs_retag',
      'quarantined',
      'archived'
    )
  ),
  check (source_cos_key like 'merchant-media/%/originals/%/%')
);

create table if not exists public.merchant_media_clips (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.merchant_media_assets(id) on delete cascade,
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  media_type text not null,
  clip_index integer not null default 0,
  clip_type text not null,
  start_time_seconds numeric,
  end_time_seconds numeric,
  bucket_name text not null,
  cos_key text not null,
  thumb_cos_key text,
  description text not null,
  tags jsonb not null default '[]'::jsonb,
  industry_tags jsonb not null default '[]'::jsonb,
  scene_tags jsonb not null default '[]'::jsonb,
  shot_tags jsonb not null default '[]'::jsonb,
  people_tags jsonb not null default '[]'::jsonb,
  quality_tags jsonb not null default '[]'::jsonb,
  tag_confidence numeric,
  tag_source text not null,
  orientation text not null,
  duration_seconds numeric,
  width integer not null,
  height integer not null,
  mime_type text not null,
  status text not null default 'ready',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (media_type in ('image', 'video')),
  check (clip_index >= 0),
  check (clip_type in ('full_video', 'segment', 'image')),
  check (orientation in ('portrait', 'landscape')),
  check (status in ('ready', 'tagging_failed', 'archived', 'quarantined', 'missing_object')),
  check (jsonb_typeof(tags) = 'array'),
  check (jsonb_array_length(tags) >= 3),
  check (tag_source in ('fixture', 'mock', 'manual', 'vision_model')),
  check (tag_confidence is null or (tag_confidence >= 0 and tag_confidence <= 1)),
  check (width > 0),
  check (height > 0),
  check (
    (
      media_type = 'video'
      and clip_type = 'full_video'
      and start_time_seconds = 0
      and duration_seconds is not null
      and duration_seconds > 0
      and end_time_seconds = duration_seconds
    )
    or (
      media_type = 'video'
      and clip_type = 'segment'
      and start_time_seconds is not null
      and start_time_seconds >= 0
      and end_time_seconds is not null
      and end_time_seconds > start_time_seconds
      and duration_seconds is not null
      and duration_seconds > 0
    )
    or (
      media_type = 'image'
      and clip_type = 'image'
      and start_time_seconds is null
      and end_time_seconds is null
      and duration_seconds is null
    )
  )
);

create unique index if not exists ux_merchant_media_assets_idempotency
on public.merchant_media_assets (merchant_id, idempotency_key);

create index if not exists idx_merchant_media_assets_merchant_status_created_at
on public.merchant_media_assets (merchant_id, status, created_at desc);

create index if not exists idx_merchant_media_assets_uploaded_by
on public.merchant_media_assets (merchant_id, uploaded_by_user_id, created_at desc);

create unique index if not exists ux_merchant_media_clips_asset_index
on public.merchant_media_clips (asset_id, clip_index);

create index if not exists idx_merchant_media_clips_merchant_status_created_at
on public.merchant_media_clips (merchant_id, status, created_at desc);

create index if not exists idx_merchant_media_clips_merchant_media_status
on public.merchant_media_clips (merchant_id, media_type, status, created_at desc);

drop trigger if exists trg_merchant_media_assets_updated_at on public.merchant_media_assets;
create trigger trg_merchant_media_assets_updated_at
before update on public.merchant_media_assets
for each row execute function public.set_updated_at();

drop trigger if exists trg_merchant_media_clips_updated_at on public.merchant_media_clips;
create trigger trg_merchant_media_clips_updated_at
before update on public.merchant_media_clips
for each row execute function public.set_updated_at();

alter table public.merchant_media_assets enable row level security;
alter table public.merchant_media_clips enable row level security;

drop policy if exists merchant_media_assets_owner_read on public.merchant_media_assets;
create policy merchant_media_assets_owner_read
on public.merchant_media_assets for select
using (
  exists (
    select 1
    from public.merchant_profiles mp
    where mp.id = merchant_media_assets.merchant_id
      and mp.owner_user_id = auth.uid()
  )
);

drop policy if exists merchant_media_assets_team_member_read on public.merchant_media_assets;
create policy merchant_media_assets_team_member_read
on public.merchant_media_assets for select
using (
  exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = merchant_media_assets.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);

drop policy if exists merchant_media_clips_owner_read on public.merchant_media_clips;
create policy merchant_media_clips_owner_read
on public.merchant_media_clips for select
using (
  exists (
    select 1
    from public.merchant_profiles mp
    where mp.id = merchant_media_clips.merchant_id
      and mp.owner_user_id = auth.uid()
  )
);

drop policy if exists merchant_media_clips_team_member_read on public.merchant_media_clips;
create policy merchant_media_clips_team_member_read
on public.merchant_media_clips for select
using (
  exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = merchant_media_clips.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);
