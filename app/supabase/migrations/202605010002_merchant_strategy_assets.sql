create table if not exists public.merchant_strategy_assets (
  merchant_id uuid primary key references public.merchant_profiles(id) on delete cascade,
  strategy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.merchant_strategy_assets (merchant_id, strategy_snapshot, created_at, updated_at)
select distinct on (merchant_id)
  merchant_id,
  strategy_snapshot,
  created_at,
  updated_at
from public.consultation_sessions
where strategy_snapshot is not null
order by merchant_id, last_message_at desc, updated_at desc
on conflict (merchant_id) do nothing;

drop trigger if exists trg_merchant_strategy_assets_updated_at on public.merchant_strategy_assets;
create trigger trg_merchant_strategy_assets_updated_at
before update on public.merchant_strategy_assets
for each row execute function public.set_updated_at();

alter table public.merchant_strategy_assets enable row level security;

drop policy if exists merchant_strategy_assets_owner_access on public.merchant_strategy_assets;
create policy merchant_strategy_assets_owner_access
on public.merchant_strategy_assets for all
using (
  merchant_id in (
    select mp.id
    from public.merchant_profiles mp
    where mp.owner_user_id = auth.uid()
  )
)
with check (
  merchant_id in (
    select mp.id
    from public.merchant_profiles mp
    where mp.owner_user_id = auth.uid()
  )
);
