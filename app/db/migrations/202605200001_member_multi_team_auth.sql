-- Member auth and multi-team support.
-- Allows member usernames to be email-like or phone-like text in domestic auth,
-- and lets one app user join multiple merchant teams.

alter table if exists public.app_users
drop constraint if exists app_users_email_check;

drop index if exists public.ux_merchant_team_members_user_id;

create unique index if not exists ux_merchant_team_members_merchant_user
on public.merchant_team_members (merchant_id, user_id);

create index if not exists idx_merchant_team_members_user_status_updated
on public.merchant_team_members (user_id, status, updated_at desc);
