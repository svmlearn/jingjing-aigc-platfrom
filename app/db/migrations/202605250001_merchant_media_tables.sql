-- Merchant media library tables for the self-hosted PostgreSQL app DB.
-- Ported from the historical deployment migrations without RLS, legacy auth policies,
-- or service-role grants. Access control is enforced by app-owned session checks
-- and repository-level merchant_id filters.

create table if not exists public.merchant_media_assets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.app_users(id) on delete restrict,
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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.merchant_media_assets
  drop constraint if exists merchant_media_assets_media_type_check;
alter table public.merchant_media_assets
  add constraint merchant_media_assets_media_type_check
  check (media_type in ('image', 'video'));

alter table public.merchant_media_assets
  drop constraint if exists merchant_media_assets_source_check;
alter table public.merchant_media_assets
  add constraint merchant_media_assets_source_check
  check (source in ('merchant_upload', 'merchant_confirmed'));

alter table public.merchant_media_assets
  drop constraint if exists merchant_media_assets_status_check;
alter table public.merchant_media_assets
  add constraint merchant_media_assets_status_check
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
  );

alter table public.merchant_media_assets
  drop constraint if exists merchant_media_assets_source_cos_key_check;
alter table public.merchant_media_assets
  add constraint merchant_media_assets_source_cos_key_check
  check (source_cos_key like 'merchant-media/%/originals/%/%');

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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_media_type_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_media_type_check_v2
  check (media_type in ('image', 'video'));

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_clip_index_nonnegative_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_clip_index_nonnegative_v2
  check (clip_index >= 0);

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_clip_type_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_clip_type_check_v2
  check (clip_type in ('full_video', 'segment', 'image'));

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_orientation_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_orientation_check_v2
  check (orientation in ('portrait', 'landscape'));

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_status_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_status_check_v2
  check (status in ('ready', 'tagging_failed', 'archived', 'quarantined', 'missing_object'));

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_tags_array_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_tags_array_check_v2
  check (jsonb_typeof(tags) = 'array');

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_tags_minimum_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_tags_minimum_check_v2
  check (jsonb_array_length(tags) >= 3);

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_tag_source_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_tag_source_check_v2
  check (tag_source in ('fixture', 'mock', 'manual', 'vision_model'));

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_tag_confidence_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_tag_confidence_check_v2
  check (tag_confidence is null or (tag_confidence >= 0 and tag_confidence <= 1));

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_dimensions_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_dimensions_check_v2
  check (width > 0 and height > 0);

alter table public.merchant_media_clips
  drop constraint if exists merchant_media_clips_timing_check_v2;
alter table public.merchant_media_clips
  add constraint merchant_media_clips_timing_check_v2
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
