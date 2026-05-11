-- V2.3.1 member-side invitation codes

create table if not exists public.merchant_team_invitation_codes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  code text not null,
  status text not null default 'active',
  max_redemptions integer not null default 100,
  redemption_count integer not null default 0,
  expires_at timestamptz,
  note text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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

alter table public.merchant_team_invitation_codes enable row level security;

drop policy if exists merchant_team_invitation_codes_select_owner on public.merchant_team_invitation_codes;
create policy merchant_team_invitation_codes_select_owner
on public.merchant_team_invitation_codes for select
using (
  merchant_id in (
    select mtm.merchant_id
    from public.merchant_team_members mtm
    where mtm.user_id = auth.uid()
      and mtm.role = 'owner'
      and mtm.status = 'active'
  )
);

drop policy if exists merchant_team_invitation_codes_manage_owner on public.merchant_team_invitation_codes;
create policy merchant_team_invitation_codes_manage_owner
on public.merchant_team_invitation_codes for all
using (
  merchant_id in (
    select mtm.merchant_id
    from public.merchant_team_members mtm
    where mtm.user_id = auth.uid()
      and mtm.role = 'owner'
      and mtm.status = 'active'
  )
)
with check (
  merchant_id in (
    select mtm.merchant_id
    from public.merchant_team_members mtm
    where mtm.user_id = auth.uid()
      and mtm.role = 'owner'
      and mtm.status = 'active'
  )
);
