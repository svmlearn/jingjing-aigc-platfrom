create table if not exists public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'ready',
  provider text not null default 'pixelle_clone',
  external_voice_id text,
  external_model_id text,
  ref_audio_asset_id uuid not null,
  authorization_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(display_name)) between 1 and 80),
  check (status in ('ready', 'disabled', 'archived')),
  check (provider in ('pixelle_clone'))
);

alter table public.asset_objects
drop constraint if exists asset_objects_owner_type_check;

alter table public.asset_objects
drop constraint if exists asset_objects_asset_type_check;

alter table public.asset_objects
add constraint asset_objects_owner_type_check
check (owner_type in ('source_item', 'content_draft', 'content_variant', 'voice_profile'));

alter table public.asset_objects
add constraint asset_objects_asset_type_check
check (asset_type in ('image', 'video', 'cover', 'subtitle', 'audio'));

alter table public.voice_profiles
drop constraint if exists fk_voice_profiles_ref_audio_asset;

alter table public.voice_profiles
add constraint fk_voice_profiles_ref_audio_asset
foreign key (ref_audio_asset_id)
references public.asset_objects(id)
on delete restrict;

create index if not exists idx_voice_profiles_merchant_creator_created_at
on public.voice_profiles (merchant_id, created_by_user_id, created_at desc);

create index if not exists idx_voice_profiles_ref_audio_asset_id
on public.voice_profiles (ref_audio_asset_id);

drop trigger if exists trg_voice_profiles_updated_at on public.voice_profiles;

create trigger trg_voice_profiles_updated_at
before update on public.voice_profiles
for each row execute function public.set_updated_at();

alter table public.voice_profiles enable row level security;

drop policy if exists voice_profiles_owner_read on public.voice_profiles;

create policy voice_profiles_owner_read
on public.voice_profiles for select
using (
  created_by_user_id = auth.uid()
  and exists (
    select 1
    from public.merchant_profiles mp
    where mp.id = voice_profiles.merchant_id
      and mp.owner_user_id = auth.uid()
  )
);

drop policy if exists voice_profiles_team_member_own_read on public.voice_profiles;

create policy voice_profiles_team_member_own_read
on public.voice_profiles for select
using (
  created_by_user_id = auth.uid()
  and exists (
    select 1
    from public.merchant_team_members mtm
    where mtm.merchant_id = voice_profiles.merchant_id
      and mtm.user_id = auth.uid()
      and mtm.status = 'active'
  )
);

drop policy if exists asset_objects_voice_profile_owner_read on public.asset_objects;

create policy asset_objects_voice_profile_owner_read
on public.asset_objects for select
using (
  owner_type = 'voice_profile'
  and owner_id in (
    select vp.id
    from public.voice_profiles vp
    where vp.created_by_user_id = auth.uid()
      and (
        exists (
          select 1
          from public.merchant_profiles mp
          where mp.id = vp.merchant_id
            and mp.owner_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.merchant_team_members mtm
          where mtm.merchant_id = vp.merchant_id
            and mtm.user_id = auth.uid()
            and mtm.status = 'active'
        )
      )
  )
);
