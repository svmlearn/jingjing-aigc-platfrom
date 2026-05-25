alter table public.voice_profiles
  drop constraint if exists voice_profiles_provider_check;

alter table public.voice_profiles
  add constraint voice_profiles_provider_check
  check (provider in ('pixelle_clone', 'aliyun_cosyvoice_clone'));

alter table public.voice_profiles
  alter column provider set default 'aliyun_cosyvoice_clone';

alter table public.asset_objects
  drop constraint if exists asset_objects_asset_type_check;

alter table public.asset_objects
  add constraint asset_objects_asset_type_check
  check (asset_type in ('image', 'video', 'cover', 'subtitle', 'audio'));

alter table public.asset_objects
  drop constraint if exists asset_objects_storage_provider_check;

alter table public.asset_objects
  add constraint asset_objects_storage_provider_check
  check (storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage'));
