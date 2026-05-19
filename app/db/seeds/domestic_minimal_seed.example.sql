-- Minimal domestic verification seed.
-- Run this after app/db/migrations/202605130001_domestic_core_baseline.sql.
--
-- Example:
--   HASH="$(node app/scripts/create-domestic-password-hash.mjs '<temporary-password>')"
--   psql "$DATABASE_URL" \
--     -v user_email='owner@example.com' \
--     -v password_hash="$HASH" \
--     -v display_name='Domestic Test Owner' \
--     -v merchant_name='Domestic Test Merchant' \
--     -f app/db/seeds/domestic_minimal_seed.example.sql

\set ON_ERROR_STOP on

with inserted_user as (
  insert into public.app_users (
    email,
    password_hash,
    display_name,
    role,
    status
  )
  select
    lower(:'user_email'),
    :'password_hash',
    :'display_name',
    'merchant_owner',
    'active'
  where not exists (
    select 1
    from public.app_users
    where lower(email) = lower(:'user_email')
  )
  returning id
),
selected_user as (
  select id from inserted_user
  union all
  select id
  from public.app_users
  where lower(email) = lower(:'user_email')
  limit 1
),
inserted_merchant as (
  insert into public.merchant_profiles (
    owner_user_id,
    name,
    industry,
    contact_name,
    status,
    plan
  )
  select
    selected_user.id,
    :'merchant_name',
    'domestic_validation',
    :'display_name',
    'active',
    'free'
  from selected_user
  where not exists (
    select 1
    from public.merchant_profiles
    where owner_user_id = selected_user.id
  )
  returning id, owner_user_id
),
selected_merchant as (
  select id, owner_user_id from inserted_merchant
  union all
  select merchant_profiles.id, merchant_profiles.owner_user_id
  from public.merchant_profiles
  join selected_user on selected_user.id = merchant_profiles.owner_user_id
  limit 1
),
inserted_team_member as (
  insert into public.merchant_team_members (
    merchant_id,
    user_id,
    role,
    status,
    display_name,
    invited_by_user_id
  )
  select
    selected_merchant.id,
    selected_merchant.owner_user_id,
    'owner',
    'active',
    :'display_name',
    selected_merchant.owner_user_id
  from selected_merchant
  where not exists (
    select 1
    from public.merchant_team_members
    where user_id = selected_merchant.owner_user_id
  )
  returning id, user_id
),
selected_team_member as (
  select id from inserted_team_member
  union all
  select merchant_team_members.id
  from public.merchant_team_members
  join selected_merchant on selected_merchant.owner_user_id = merchant_team_members.user_id
  limit 1
)
select
  selected_user.id as user_id,
  selected_merchant.id as merchant_id,
  selected_team_member.id as team_member_id
from selected_user
cross join selected_merchant
cross join selected_team_member;
