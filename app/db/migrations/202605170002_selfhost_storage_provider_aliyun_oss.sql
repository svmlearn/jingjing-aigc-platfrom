alter table public.asset_objects
  drop constraint if exists asset_objects_storage_provider_check;

alter table public.asset_objects
  add constraint asset_objects_storage_provider_check
  check (storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_storage_provider_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_storage_provider_check
  check (storage_provider is null or storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage'));
