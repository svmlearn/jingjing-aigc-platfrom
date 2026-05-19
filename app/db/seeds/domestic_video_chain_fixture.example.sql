-- Domestic video-chain API fixture.
-- Run this after domestic_minimal_seed.example.sql.
--
-- Example:
--   psql "$DATABASE_URL" \
--     -v user_email='owner@example.com' \
--     -f app/db/seeds/domestic_video_chain_fixture.example.sql

\set ON_ERROR_STOP on

create temporary table if not exists domestic_video_chain_fixture_result (
  user_id uuid not null,
  merchant_id uuid not null,
  source_item_id uuid not null,
  draft_id uuid not null,
  content_variant_id uuid not null,
  draft_storage_key_prefix text not null
);

truncate domestic_video_chain_fixture_result;

with selected_user as (
  select app_users.id as user_id
  from public.app_users
  where lower(app_users.email) = lower(:'user_email')
  limit 1
),
selected_merchant as (
  select merchant_profiles.id as merchant_id, selected_user.user_id
  from public.merchant_profiles
  join selected_user on selected_user.user_id = merchant_profiles.owner_user_id
  limit 1
),
inserted_source_item as (
  insert into public.source_items (
    merchant_id,
    platform,
    source_type,
    source_url,
    title,
    body_text,
    script_text,
    structure_summary,
    trace_payload,
    is_selected_for_rewrite
  )
  select
    selected_merchant.merchant_id,
    'douyin',
    'manual_text',
    'domestic-fixture://' || gen_random_uuid()::text,
    'Domestic video fixture source',
    'Local API smoke fixture for domestic PostgreSQL verification.',
    'Open with storefront context, show service details, close with consultation CTA.',
    '{"source":"domestic_video_chain_fixture"}'::jsonb,
    '{"seed":"domestic_video_chain_fixture"}'::jsonb,
    true
  from selected_merchant
  returning id, merchant_id
),
inserted_draft as (
  insert into public.content_drafts (
    source_item_id,
    merchant_id,
    created_by_user_id,
    working_title,
    rewrite_goal,
    input_snapshot,
    comment_insights,
    status
  )
  select
    inserted_source_item.id,
    selected_merchant.merchant_id,
    selected_merchant.user_id,
    'Domestic video fixture draft',
    'Verify domestic PostgreSQL video job creation without external AI generation.',
    '{"source":"domestic_video_chain_fixture"}'::jsonb,
    '{}'::jsonb,
    'review_pending'
  from inserted_source_item
  join selected_merchant on selected_merchant.merchant_id = inserted_source_item.merchant_id
  returning id, source_item_id, merchant_id, created_by_user_id
),
inserted_variant as (
  insert into public.content_variants (
    draft_id,
    platform,
    variant_type,
    version_no,
    title,
    body_text,
    script_text,
    hashtags,
    cta_text,
    generation_mode,
    review_status
  )
  select
    inserted_draft.id,
    'douyin',
    'video_script',
    1,
    'Domestic video fixture script',
    null,
    E'开场：展示门店环境，建立信任。\\n画面：门店门头、服务过程和顾客到店动线。\\n素材：使用上传的视频素材作为主画面。\\n结尾：引导用户预约咨询。',
    '["国内化验证","视频链路"]'::jsonb,
    '点击预约咨询',
    'manual_edit',
    'approved'
  from inserted_draft
  returning id, draft_id
)
insert into domestic_video_chain_fixture_result (
  user_id,
  merchant_id,
  source_item_id,
  draft_id,
  content_variant_id,
  draft_storage_key_prefix
)
select
  selected_merchant.user_id,
  selected_merchant.merchant_id,
  inserted_source_item.id as source_item_id,
  inserted_draft.id as draft_id,
  inserted_variant.id as content_variant_id,
  'draft-inputs/' || selected_merchant.merchant_id || '/' || inserted_draft.id as draft_storage_key_prefix
from selected_merchant
cross join inserted_source_item
cross join inserted_draft
cross join inserted_variant;

update public.content_drafts
set
  selected_variant_id = domestic_video_chain_fixture_result.content_variant_id,
  status = 'ready_to_publish',
  updated_at = timezone('utc', now())
from domestic_video_chain_fixture_result
where content_drafts.id = domestic_video_chain_fixture_result.draft_id;

select
  user_id,
  merchant_id,
  source_item_id,
  draft_id,
  content_variant_id,
  draft_storage_key_prefix
from domestic_video_chain_fixture_result;
