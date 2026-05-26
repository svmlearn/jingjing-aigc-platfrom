create table if not exists public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  created_by_user_id uuid not null references public.app_users(id) on delete cascade,
  display_name text not null,
  status text not null default 'ready',
  provider text not null default 'pixelle_clone',
  external_voice_id text,
  external_model_id text,
  ref_audio_asset_id uuid not null,
  authorization_accepted_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(display_name)) between 1 and 80),
  check (status in ('ready', 'disabled', 'archived')),
  check (provider in ('pixelle_clone'))
);

alter table public.asset_objects
  drop constraint if exists asset_objects_owner_type_check;

alter table public.asset_objects
  drop constraint if exists asset_objects_asset_type_check;

alter table public.asset_objects
  drop constraint if exists asset_objects_storage_provider_check;

alter table public.asset_objects
  add constraint asset_objects_owner_type_check
  check (owner_type in ('source_item', 'content_draft', 'content_variant', 'voice_profile'));

alter table public.asset_objects
  add constraint asset_objects_asset_type_check
  check (asset_type in ('image', 'video', 'cover', 'subtitle', 'audio'));

alter table public.asset_objects
  add constraint asset_objects_storage_provider_check
  check (storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage'));

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

create unique index if not exists idx_voice_profiles_one_ready_per_creator
on public.voice_profiles (merchant_id, created_by_user_id)
where status = 'ready';

drop trigger if exists trg_voice_profiles_updated_at on public.voice_profiles;
create trigger trg_voice_profiles_updated_at
before update on public.voice_profiles
for each row execute function public.set_updated_at();
