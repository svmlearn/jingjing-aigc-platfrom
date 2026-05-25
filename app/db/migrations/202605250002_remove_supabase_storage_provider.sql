do $$
begin
  if exists (
    select 1
    from public.asset_objects
    where storage_provider = 'supabase_storage'
    limit 1
  ) then
    raise exception
      'Cannot apply 202605250002_remove_supabase_storage_provider: public.asset_objects still contains storage_provider = supabase_storage. Clean or migrate historical data first.';
  end if;

  if exists (
    select 1
    from public.knowledge_documents
    where storage_provider = 'supabase_storage'
    limit 1
  ) then
    raise exception
      'Cannot apply 202605250002_remove_supabase_storage_provider: public.knowledge_documents still contains storage_provider = supabase_storage. Clean or migrate historical data first.';
  end if;
end $$;

alter table public.asset_objects
  drop constraint if exists asset_objects_storage_provider_check;

alter table public.asset_objects
  add constraint asset_objects_storage_provider_check
  check (storage_provider in ('tencent_cos', 'aliyun_oss'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_storage_provider_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_storage_provider_check
  check (storage_provider is null or storage_provider in ('tencent_cos', 'aliyun_oss', 'inline_seed'));
