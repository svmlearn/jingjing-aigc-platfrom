-- V0.1-A platform admin foundation
-- Scope:
-- - merchant status supports disabled
-- - merchant membership plan baseline
-- - invitation code note
-- - platform settings persistence
-- - platform admin audit events

alter table public.merchant_profiles
add column if not exists plan text not null default 'free';

alter table public.merchant_profiles
drop constraint if exists merchant_profiles_status_check;

alter table public.merchant_profiles
add constraint merchant_profiles_status_check
check (status in ('active', 'disabled', 'archived'));

alter table public.merchant_profiles
drop constraint if exists merchant_profiles_plan_check;

alter table public.merchant_profiles
add constraint merchant_profiles_plan_check
check (plan in ('free', 'plus', 'pro'));

alter table public.invitation_codes
add column if not exists note text;

create table if not exists public.platform_settings (
  key text primary key,
  category text not null,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (category in ('llm', 'import', 'membership'))
);

create table if not exists public.platform_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_label text not null,
  event_type text not null,
  target_type text not null,
  target_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_merchant_profiles_status_plan_created_at
on public.merchant_profiles (status, plan, created_at desc);

create index if not exists idx_platform_admin_events_created_at
on public.platform_admin_events (created_at desc);

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;

create trigger trg_platform_settings_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

insert into public.platform_settings (key, category, value, description)
values
  (
    'llm_runtime',
    'llm',
    '{
      "providerLabel": "OpenAI Compatible",
      "baseUrl": "https://api.openai.com/v1",
      "primaryModel": "gpt-4.1",
      "fallbackModel": "gpt-4.1-mini",
      "temperature": 0.7,
      "maxTokens": 1800,
      "timeoutSeconds": 45,
      "retryCount": 2
    }'::jsonb,
    'Platform-level rewrite runtime defaults.'
  ),
  (
    'import_runtime',
    'import',
    '{
      "importProvider": "apify",
      "defaultMaxComments": 30,
      "defaultCreatorPosts": 20,
      "waitSeconds": 120
    }'::jsonb,
    'Platform-level import runtime defaults.'
  ),
  (
    'membership_plans',
    'membership',
    '{
      "free": {
        "dailyCredits": 20,
        "description": "适合测试期商户，先按 1 次改写 = 1 点。"
      },
      "plus": {
        "dailyCredits": 100,
        "description": "适合稳定使用中的商户，支持更高频改写。"
      },
      "pro": {
        "dailyCredits": 300,
        "description": "适合高频运营商户，预留更高改写额度。"
      }
    }'::jsonb,
    'Membership plan defaults for merchant daily rewrite credits.'
  )
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;
alter table public.platform_admin_events enable row level security;
