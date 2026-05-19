alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_storage_provider_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_storage_provider_check
  check (
    storage_provider is null
    or storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage', 'inline_seed')
  );
