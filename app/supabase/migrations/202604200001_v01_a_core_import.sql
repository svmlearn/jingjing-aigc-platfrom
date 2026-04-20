-- V0.1-A core import baseline
-- Scope:
-- - invite-code merchant signup
-- - one merchant = one owner account
-- - API-first import pipeline backed by Apify
-- - source_items / imported_comments persistence

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'archived'))
);

create table public.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purpose text not null default 'merchant_signup',
  status text not null default 'active',
  max_redemptions integer not null default 1,
  redemption_count integer not null default 0,
  expires_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  redeemed_merchant_id uuid references public.merchant_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (purpose in ('merchant_signup')),
  check (status in ('active', 'redeemed', 'expired', 'disabled')),
  check (max_redemptions >= 1),
  check (redemption_count >= 0),
  check (redemption_count <= max_redemptions)
);

create table public.audience_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  name text not null,
  persona_summary text not null,
  pain_points jsonb not null default '[]'::jsonb,
  motivations jsonb not null default '[]'::jsonb,
  taboos jsonb not null default '[]'::jsonb,
  preferred_tone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_jobs (
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
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (platform in ('xiaohongshu', 'douyin')),
  check (import_type in ('detail', 'creator', 'comments', 'search')),
  check (status in ('pending', 'running', 'succeeded', 'partial', 'failed'))
);

create table public.source_items (
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
  created_at timestamptz not null default now(),
  check (platform in ('xiaohongshu', 'douyin')),
  check (source_type in ('detail', 'creator', 'search', 'manual_text'))
);

create table public.imported_comments (
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
  created_at timestamptz not null default now()
);

create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.source_items(id) on delete restrict,
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  audience_profile_id uuid references public.audience_profiles(id) on delete set null,
  working_title text,
  rewrite_goal text,
  input_snapshot jsonb not null default '{}'::jsonb,
  comment_insights jsonb not null default '{}'::jsonb,
  status text not null default 'drafting',
  selected_variant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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

create table public.content_variants (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform in ('xiaohongshu', 'douyin')),
  check (variant_type in ('note', 'video_script')),
  check (generation_mode in ('ai_generated', 'manual_edit', 'imported')),
  check (review_status in ('editing', 'review_pending', 'approved', 'rejected'))
);

alter table public.content_drafts
add constraint fk_content_drafts_selected_variant
foreign key (selected_variant_id)
references public.content_variants(id)
on delete set null;

create table public.asset_objects (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  asset_type text not null,
  storage_key text not null,
  origin_url text,
  mime_type text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (owner_type in ('source_item', 'content_variant')),
  check (asset_type in ('image', 'video', 'cover'))
);

create unique index ux_merchant_profiles_owner_user_id
on public.merchant_profiles (owner_user_id)
where owner_user_id is not null;

create index idx_invitation_codes_status
on public.invitation_codes (status);

create index idx_audience_profiles_merchant_id
on public.audience_profiles (merchant_id);

create index idx_import_jobs_merchant_status_created_at
on public.import_jobs (merchant_id, status, created_at desc);

create index idx_import_jobs_status_created_at
on public.import_jobs (status, created_at desc);

create index idx_source_items_merchant_created_at
on public.source_items (merchant_id, created_at desc);

create index idx_source_items_import_job_id
on public.source_items (import_job_id);

create unique index ux_source_items_platform_external_item_id
on public.source_items (platform, external_item_id);

create unique index ux_source_items_source_url
on public.source_items (source_url);

create index idx_imported_comments_source_item_id
on public.imported_comments (source_item_id);

create unique index ux_imported_comments_source_external_id
on public.imported_comments (source_item_id, external_comment_id);

create index idx_content_drafts_merchant_status
on public.content_drafts (merchant_id, status);

create unique index ux_content_variants_draft_platform_version
on public.content_variants (draft_id, platform, version_no);

create index idx_content_variants_draft_id
on public.content_variants (draft_id);

create index idx_asset_objects_owner
on public.asset_objects (owner_type, owner_id);

create trigger trg_merchant_profiles_updated_at
before update on public.merchant_profiles
for each row execute function public.set_updated_at();

create trigger trg_invitation_codes_updated_at
before update on public.invitation_codes
for each row execute function public.set_updated_at();

create trigger trg_audience_profiles_updated_at
before update on public.audience_profiles
for each row execute function public.set_updated_at();

create trigger trg_content_drafts_updated_at
before update on public.content_drafts
for each row execute function public.set_updated_at();

create trigger trg_content_variants_updated_at
before update on public.content_variants
for each row execute function public.set_updated_at();

create or replace function public.redeem_invitation_code(
  p_code text,
  p_owner_user_id uuid,
  p_merchant_name text,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_address text default null,
  p_service_items jsonb default '[]'::jsonb,
  p_industry text default null,
  p_brand_summary text default null,
  p_region_summary text default null,
  p_tone_style text default null,
  p_default_cta jsonb default '[]'::jsonb,
  p_forbidden_words jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code public.invitation_codes%rowtype;
  v_merchant_id uuid;
begin
  if p_owner_user_id is null then
    raise exception 'OWNER_USER_ID_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(p_merchant_name), '') is null then
    raise exception 'MERCHANT_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_code
  from public.invitation_codes
  where code = trim(p_code)
  for update;

  if not found then
    raise exception 'INVITATION_CODE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_code.purpose <> 'merchant_signup' then
    raise exception 'INVITATION_CODE_PURPOSE_INVALID' using errcode = 'P0001';
  end if;

  if v_code.status <> 'active' then
    raise exception 'INVITATION_CODE_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    update public.invitation_codes
    set status = 'expired'
    where id = v_code.id;

    raise exception 'INVITATION_CODE_EXPIRED' using errcode = 'P0001';
  end if;

  if v_code.redemption_count >= v_code.max_redemptions then
    raise exception 'INVITATION_CODE_REDEEMED' using errcode = 'P0001';
  end if;

  insert into public.merchant_profiles (
    owner_user_id,
    name,
    industry,
    contact_name,
    contact_phone,
    address,
    service_items,
    brand_summary,
    region_summary,
    tone_style,
    default_cta,
    forbidden_words
  )
  values (
    p_owner_user_id,
    trim(p_merchant_name),
    nullif(trim(coalesce(p_industry, '')), ''),
    nullif(trim(coalesce(p_contact_name, '')), ''),
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    coalesce(p_service_items, '[]'::jsonb),
    nullif(trim(coalesce(p_brand_summary, '')), ''),
    nullif(trim(coalesce(p_region_summary, '')), ''),
    nullif(trim(coalesce(p_tone_style, '')), ''),
    coalesce(p_default_cta, '[]'::jsonb),
    coalesce(p_forbidden_words, '[]'::jsonb)
  )
  returning id into v_merchant_id;

  update public.invitation_codes
  set
    redemption_count = redemption_count + 1,
    redeemed_by_user_id = p_owner_user_id,
    redeemed_merchant_id = v_merchant_id,
    status = case
      when redemption_count + 1 >= max_redemptions then 'redeemed'
      else status
    end
  where id = v_code.id;

  return v_merchant_id;
end;
$$;

revoke all on function public.redeem_invitation_code(
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public;

grant execute on function public.redeem_invitation_code(
  text,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to service_role;

alter table public.merchant_profiles enable row level security;
alter table public.invitation_codes enable row level security;
alter table public.audience_profiles enable row level security;
alter table public.import_jobs enable row level security;
alter table public.source_items enable row level security;
alter table public.imported_comments enable row level security;
alter table public.content_drafts enable row level security;
alter table public.content_variants enable row level security;
alter table public.asset_objects enable row level security;

create policy merchant_profiles_select_owner
on public.merchant_profiles for select
using (owner_user_id = auth.uid());

create policy merchant_profiles_update_owner
on public.merchant_profiles for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy audience_profiles_owner_access
on public.audience_profiles for all
using (
  merchant_id in (
    select id from public.merchant_profiles where owner_user_id = auth.uid()
  )
)
with check (
  merchant_id in (
    select id from public.merchant_profiles where owner_user_id = auth.uid()
  )
);

create policy import_jobs_owner_read
on public.import_jobs for select
using (
  merchant_id in (
    select id from public.merchant_profiles where owner_user_id = auth.uid()
  )
);

create policy source_items_owner_read
on public.source_items for select
using (
  merchant_id in (
    select id from public.merchant_profiles where owner_user_id = auth.uid()
  )
);

create policy imported_comments_owner_read
on public.imported_comments for select
using (
  source_item_id in (
    select si.id
    from public.source_items si
    join public.merchant_profiles mp on mp.id = si.merchant_id
    where mp.owner_user_id = auth.uid()
  )
);

create policy content_drafts_owner_access
on public.content_drafts for all
using (
  merchant_id in (
    select id from public.merchant_profiles where owner_user_id = auth.uid()
  )
)
with check (
  merchant_id in (
    select id from public.merchant_profiles where owner_user_id = auth.uid()
  )
);

create policy content_variants_owner_access
on public.content_variants for all
using (
  draft_id in (
    select cd.id
    from public.content_drafts cd
    join public.merchant_profiles mp on mp.id = cd.merchant_id
    where mp.owner_user_id = auth.uid()
  )
)
with check (
  draft_id in (
    select cd.id
    from public.content_drafts cd
    join public.merchant_profiles mp on mp.id = cd.merchant_id
    where mp.owner_user_id = auth.uid()
  )
);

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
