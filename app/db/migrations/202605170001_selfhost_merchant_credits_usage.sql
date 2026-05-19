create table if not exists public.merchant_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references public.merchant_profiles(id) on delete cascade,
  balance integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint merchant_credit_accounts_balance_check check (balance >= 0),
  constraint merchant_credit_accounts_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_merchant_credit_accounts_merchant_id
on public.merchant_credit_accounts (merchant_id);

drop trigger if exists trg_merchant_credit_accounts_updated_at on public.merchant_credit_accounts;
create trigger trg_merchant_credit_accounts_updated_at
before update on public.merchant_credit_accounts
for each row execute function public.set_updated_at();

create table if not exists public.merchant_usage_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  action_type text not null,
  agent_id uuid references public.agent_configs(id) on delete set null,
  estimated_cost integer,
  actual_cost integer,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint merchant_usage_events_status_check check (
    status in ('reserved', 'consumed', 'failed', 'refunded', 'skipped')
  ),
  constraint merchant_usage_events_estimated_cost_check check (
    estimated_cost is null or estimated_cost >= 0
  ),
  constraint merchant_usage_events_actual_cost_check check (
    actual_cost is null or actual_cost >= 0
  ),
  constraint merchant_usage_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_merchant_usage_events_merchant_created_at
on public.merchant_usage_events (merchant_id, created_at desc);

create index if not exists idx_merchant_usage_events_status_created_at
on public.merchant_usage_events (status, created_at desc);

create table if not exists public.merchant_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  credit_account_id uuid references public.merchant_credit_accounts(id) on delete set null,
  direction text not null,
  amount integer not null,
  reason text not null,
  related_usage_event_id uuid references public.merchant_usage_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint merchant_credit_ledger_direction_check check (
    direction in ('grant', 'consume', 'refund', 'adjust', 'expire')
  ),
  constraint merchant_credit_ledger_amount_check check (amount >= 0),
  constraint merchant_credit_ledger_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_merchant_credit_ledger_merchant_created_at
on public.merchant_credit_ledger (merchant_id, created_at desc);

create index if not exists idx_merchant_credit_ledger_account_created_at
on public.merchant_credit_ledger (credit_account_id, created_at desc);

create index if not exists idx_merchant_credit_ledger_related_usage_event_id
on public.merchant_credit_ledger (related_usage_event_id)
where related_usage_event_id is not null;
