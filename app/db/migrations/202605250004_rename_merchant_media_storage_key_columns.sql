do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_assets'
      and column_name = 'source_cos_key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_assets'
      and column_name = 'source_storage_key'
  ) then
    alter table public.merchant_media_assets
      rename column source_cos_key to source_storage_key;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_clips'
      and column_name = 'cos_key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_clips'
      and column_name = 'storage_key'
  ) then
    alter table public.merchant_media_clips
      rename column cos_key to storage_key;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_clips'
      and column_name = 'thumb_cos_key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_clips'
      and column_name = 'thumb_storage_key'
  ) then
    alter table public.merchant_media_clips
      rename column thumb_cos_key to thumb_storage_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'merchant_media_assets'
      and column_name = 'source_storage_key'
  ) then
    alter table public.merchant_media_assets
      drop constraint if exists merchant_media_assets_source_cos_key_check;

    alter table public.merchant_media_assets
      drop constraint if exists merchant_media_assets_source_storage_key_check;

    alter table public.merchant_media_assets
      add constraint merchant_media_assets_source_storage_key_check
      check (source_storage_key like 'merchant-media/%/originals/%/%');
  end if;
end $$;
