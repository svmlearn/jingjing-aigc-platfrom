-- Domestic PostgreSQL core baseline.
-- Derived from app/supabase/migrations for the first domestic IP validation.
-- Supabase-specific auth schema, RLS policies, and service_role grants are intentionally omitted.

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

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text,
  role text not null default 'merchant_user',
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (position('@' in email) > 1),
  check (role in ('platform_admin', 'merchant_owner', 'merchant_member', 'merchant_user')),
  check (status in ('active', 'disabled'))
);

create unique index if not exists ux_app_users_lower_email
on public.app_users (lower(email));

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ux_user_sessions_token_hash
on public.user_sessions (token_hash);

create index if not exists idx_user_sessions_user_expires_at
on public.user_sessions (user_id, expires_at desc);

create table if not exists public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.app_users(id) on delete set null,
  name text not null,
  industry text,
  contact_name text,
  contact_phone text,
  address text,
  service_items jsonb not null default '[]'::jsonb,
  brand_summary text,
  region_summary text,
  tone_style text,
  default_cta jsonb not null default '[]'::jsonb,
  forbidden_words jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  plan text not null default 'free',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (status in ('active', 'disabled', 'archived')),
  check (plan in ('free', 'plus', 'pro', 'max'))
);

create unique index if not exists ux_merchant_profiles_owner_user_id
on public.merchant_profiles (owner_user_id)
where owner_user_id is not null;

create index if not exists idx_merchant_profiles_status_plan_created_at
on public.merchant_profiles (status, plan, created_at desc);

drop trigger if exists trg_merchant_profiles_updated_at on public.merchant_profiles;
create trigger trg_merchant_profiles_updated_at
before update on public.merchant_profiles
for each row execute function public.set_updated_at();

create table if not exists public.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purpose text not null default 'merchant_signup',
  status text not null default 'active',
  max_redemptions integer not null default 1,
  redemption_count integer not null default 0,
  expires_at timestamptz,
  note text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  redeemed_by_user_id uuid references public.app_users(id) on delete set null,
  redeemed_merchant_id uuid references public.merchant_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (purpose in ('merchant_signup')),
  check (status in ('active', 'redeemed', 'expired', 'disabled')),
  check (max_redemptions >= 1),
  check (redemption_count >= 0),
  check (redemption_count <= max_redemptions)
);

create index if not exists idx_invitation_codes_status
on public.invitation_codes (status);

drop trigger if exists trg_invitation_codes_updated_at on public.invitation_codes;
create trigger trg_invitation_codes_updated_at
before update on public.invitation_codes
for each row execute function public.set_updated_at();

create table if not exists public.merchant_team_members (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  display_name text,
  invited_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (role in ('owner', 'member')),
  check (status in ('active', 'disabled'))
);

create unique index if not exists ux_merchant_team_members_user_id
on public.merchant_team_members (user_id);

create index if not exists idx_merchant_team_members_merchant_role
on public.merchant_team_members (merchant_id, role, status);

drop trigger if exists trg_merchant_team_members_updated_at on public.merchant_team_members;
create trigger trg_merchant_team_members_updated_at
before update on public.merchant_team_members
for each row execute function public.set_updated_at();

create table if not exists public.merchant_team_invitation_codes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  code text not null,
  status text not null default 'active',
  max_redemptions integer not null default 100,
  redemption_count integer not null default 0,
  expires_at timestamptz,
  note text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (code = upper(code)),
  check (status in ('active', 'disabled', 'expired')),
  check (max_redemptions > 0),
  check (redemption_count >= 0),
  check (redemption_count <= max_redemptions)
);

create unique index if not exists ux_merchant_team_invitation_codes_code
on public.merchant_team_invitation_codes (code);

create index if not exists idx_merchant_team_invitation_codes_merchant_status
on public.merchant_team_invitation_codes (merchant_id, status);

drop trigger if exists trg_merchant_team_invitation_codes_updated_at on public.merchant_team_invitation_codes;
create trigger trg_merchant_team_invitation_codes_updated_at
before update on public.merchant_team_invitation_codes
for each row execute function public.set_updated_at();

create table if not exists public.audience_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  name text not null,
  persona_summary text not null,
  pain_points jsonb not null default '[]'::jsonb,
  motivations jsonb not null default '[]'::jsonb,
  taboos jsonb not null default '[]'::jsonb,
  preferred_tone text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_audience_profiles_merchant_id
on public.audience_profiles (merchant_id);

drop trigger if exists trg_audience_profiles_updated_at on public.audience_profiles;
create trigger trg_audience_profiles_updated_at
before update on public.audience_profiles
for each row execute function public.set_updated_at();

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  platform text not null,
  import_type text not null,
  input_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  total_items integer,
  success_items integer not null default 0,
  error_summary text,
  log_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  check (platform in ('xiaohongshu', 'douyin')),
  check (import_type in ('detail', 'creator', 'comments', 'search')),
  check (status in ('pending', 'running', 'succeeded', 'partial', 'failed'))
);

create index if not exists idx_import_jobs_merchant_status_created_at
on public.import_jobs (merchant_id, status, created_at desc);

create index if not exists idx_import_jobs_status_created_at
on public.import_jobs (status, created_at desc);

create table if not exists public.source_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchant_profiles(id) on delete cascade,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  platform text not null,
  source_type text not null,
  external_item_id text,
  source_url text,
  creator_id text,
  creator_name text,
  title text,
  body_text text,
  script_text text,
  structure_summary jsonb not null default '{}'::jsonb,
  engagement_snapshot jsonb not null default '{}'::jsonb,
  trace_payload jsonb not null default '{}'::jsonb,
  is_selected_for_rewrite boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  check (platform in ('xiaohongshu', 'douyin')),
  check (source_type in ('detail', 'creator', 'search', 'manual_text'))
);

create index if not exists idx_source_items_merchant_created_at
on public.source_items (merchant_id, created_at desc);

create index if not exists idx_source_items_import_job_id
on public.source_items (import_job_id);

create unique index if not exists ux_source_items_merchant_platform_external_item_id
on public.source_items (merchant_id, platform, external_item_id)
where external_item_id is not null;

create unique index if not exists ux_source_items_merchant_source_url
on public.source_items (merchant_id, source_url)
where source_url is not null;

create table if not exists public.imported_comments (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.source_items(id) on delete cascade,
  external_comment_id text,
  parent_external_comment_id text,
  author_name text,
  content text not null,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  published_at timestamptz,
  sort_score numeric(12, 2),
  trace_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_imported_comments_source_item_id
on public.imported_comments (source_item_id);

create unique index if not exists ux_imported_comments_source_external_id
on public.imported_comments (source_item_id, external_comment_id);

create table if not exists public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.source_items(id) on delete restrict,
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  audience_profile_id uuid references public.audience_profiles(id) on delete set null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  working_title text,
  rewrite_goal text,
  input_snapshot jsonb not null default '{}'::jsonb,
  comment_insights jsonb not null default '{}'::jsonb,
  status text not null default 'drafting',
  selected_variant_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    status in (
      'drafting',
      'review_pending',
      'ready_to_publish',
      'publishing',
      'published',
      'archived'
    )
  )
);

create index if not exists idx_content_drafts_merchant_status
on public.content_drafts (merchant_id, status);

create index if not exists idx_content_drafts_merchant_creator_created_at
on public.content_drafts (merchant_id, created_by_user_id, created_at desc);

drop trigger if exists trg_content_drafts_updated_at on public.content_drafts;
create trigger trg_content_drafts_updated_at
before update on public.content_drafts
for each row execute function public.set_updated_at();

create table if not exists public.content_variants (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.content_drafts(id) on delete cascade,
  platform text not null,
  variant_type text not null,
  version_no integer not null,
  title text,
  body_text text,
  script_text text,
  hashtags jsonb not null default '[]'::jsonb,
  cta_text text,
  generation_mode text not null default 'ai_generated',
  review_status text not null default 'editing',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (platform in ('xiaohongshu', 'douyin')),
  check (variant_type in ('note', 'video_script')),
  check (generation_mode in ('ai_generated', 'manual_edit', 'imported')),
  check (review_status in ('editing', 'review_pending', 'approved', 'rejected'))
);

alter table public.content_drafts
drop constraint if exists fk_content_drafts_selected_variant;

alter table public.content_drafts
add constraint fk_content_drafts_selected_variant
foreign key (selected_variant_id)
references public.content_variants(id)
on delete set null;

create unique index if not exists ux_content_variants_draft_platform_version
on public.content_variants (draft_id, platform, version_no);

create index if not exists idx_content_variants_draft_id
on public.content_variants (draft_id);

drop trigger if exists trg_content_variants_updated_at on public.content_variants;
create trigger trg_content_variants_updated_at
before update on public.content_variants
for each row execute function public.set_updated_at();

create table if not exists public.asset_objects (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  asset_type text not null,
  storage_provider text not null default 'aliyun_oss',
  bucket_name text,
  storage_key text not null,
  origin_url text,
  mime_type text,
  file_size_bytes bigint,
  etag text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (owner_type in ('source_item', 'content_draft', 'content_variant')),
  check (asset_type in ('image', 'video', 'cover', 'subtitle')),
  check (storage_provider in ('tencent_cos', 'supabase_storage'))
);

create index if not exists idx_asset_objects_owner
on public.asset_objects (owner_type, owner_id);

create unique index if not exists ux_asset_objects_cos_object
on public.asset_objects (bucket_name, storage_key)
where bucket_name is not null;

drop trigger if exists trg_asset_objects_updated_at on public.asset_objects;
create trigger trg_asset_objects_updated_at
before update on public.asset_objects
for each row execute function public.set_updated_at();

create table if not exists public.video_edit_jobs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  created_by_user_id uuid references public.app_users(id) on delete set null,
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
  failure_code text,
  result_payload jsonb not null default '{}'::jsonb,
  log_payload jsonb not null default '{}'::jsonb,
  worker_id text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  timeout_at timestamptz,
  manual_rerun_requested_at timestamptz,
  manual_rerun_requested_by_user_id uuid references public.app_users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
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

create index if not exists idx_video_edit_jobs_merchant_status_created_at
on public.video_edit_jobs (merchant_id, status, created_at desc);

create index if not exists idx_video_edit_jobs_merchant_creator_created_at
on public.video_edit_jobs (merchant_id, created_by_user_id, created_at desc);

create index if not exists idx_video_edit_jobs_variant_created_at
on public.video_edit_jobs (content_variant_id, created_at desc);

create index if not exists idx_video_edit_jobs_status_created_at
on public.video_edit_jobs (status, created_at asc);

create index if not exists idx_video_edit_jobs_status_heartbeat_at
on public.video_edit_jobs (status, heartbeat_at);

create unique index if not exists ux_video_edit_jobs_one_in_flight_per_creator_variant
on public.video_edit_jobs (merchant_id, created_by_user_id, draft_id, content_variant_id)
where status in ('pending', 'queued', 'preparing', 'running')
  and created_by_user_id is not null;

create unique index if not exists ux_video_edit_jobs_one_in_flight_per_owner_variant
on public.video_edit_jobs (merchant_id, draft_id, content_variant_id)
where status in ('pending', 'queued', 'preparing', 'running')
  and created_by_user_id is null;

drop trigger if exists trg_video_edit_jobs_updated_at on public.video_edit_jobs;
create trigger trg_video_edit_jobs_updated_at
before update on public.video_edit_jobs
for each row execute function public.set_updated_at();

create table if not exists public.merchant_memberships (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  tier text not null default 'free',
  status text not null default 'trial',
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (tier in ('free', 'plus', 'pro', 'max')),
  check (status in ('trial', 'active', 'expired', 'cancelled')),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists ux_merchant_memberships_merchant_id
on public.merchant_memberships (merchant_id);

drop trigger if exists trg_merchant_memberships_updated_at on public.merchant_memberships;
create trigger trg_merchant_memberships_updated_at
before update on public.merchant_memberships
for each row execute function public.set_updated_at();

create table if not exists public.daily_content_tasks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  task_date date not null,
  theme text not null,
  team_calendar_source jsonb not null default '{}'::jsonb,
  article_task jsonb not null default '{}'::jsonb,
  video_task jsonb not null default '{}'::jsonb,
  knowledge_refs jsonb not null default '[]'::jsonb,
  material_refs jsonb not null default '[]'::jsonb,
  status text not null default 'generated',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
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

drop trigger if exists trg_daily_content_tasks_updated_at on public.daily_content_tasks;
create trigger trg_daily_content_tasks_updated_at
before update on public.daily_content_tasks
for each row execute function public.set_updated_at();

create table if not exists public.content_generation_batches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  created_by_user_id uuid references public.app_users(id) on delete set null,
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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
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
  member_user_id uuid not null references public.app_users(id) on delete cascade,
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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
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
