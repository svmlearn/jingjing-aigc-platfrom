-- Unify app LLM runtime defaults on SiliconFlow/Qwen.
-- This cleans up old OpenAI defaults left by early staging migrations.

update public.platform_settings
set
  value = jsonb_build_object(
    'providerLabel', 'SiliconFlow',
    'baseUrl', 'https://api.siliconflow.cn/v1',
    'primaryModel', 'Qwen/Qwen3-32B',
    'fallbackModel', 'Qwen/Qwen3-14B',
    'temperature', coalesce((value->>'temperature')::numeric, 0.7),
    'maxTokens', greatest(coalesce((value->>'maxTokens')::integer, 1800), 1800),
    'timeoutSeconds', greatest(coalesce((value->>'timeoutSeconds')::integer, 60), 60),
    'retryCount', coalesce((value->>'retryCount')::integer, 2)
  ),
  description = 'Platform-level SiliconFlow/Qwen runtime defaults.'
where key = 'llm_runtime'
  and (
    value->>'baseUrl' is null
    or value->>'baseUrl' = ''
    or value->>'baseUrl' = 'https://api.openai.com/v1'
    or value->>'primaryModel' like 'gpt-%'
  );

update public.platform_settings
set value = jsonb_set(value, '{model}', to_jsonb('Qwen/Qwen3-32B'::text), true)
where key = 'consultation_agent'
  and (
    value->>'model' is null
    or value->>'model' = ''
    or value->>'model' like 'gpt-%'
  );

update public.platform_settings
set value = jsonb_set(value, '{model}', to_jsonb('Qwen/Qwen3-14B'::text), true)
where key = 'script_production_agent'
  and (
    value->>'model' is null
    or value->>'model' = ''
    or value->>'model' like 'gpt-%'
  );

update public.platform_settings
set value = jsonb_set(value, '{embeddingModel}', to_jsonb('Qwen/Qwen3-Embedding-4B'::text), true)
where key = 'knowledge_runtime'
  and (
    value->>'embeddingModel' is null
    or value->>'embeddingModel' = ''
    or value->>'embeddingModel' like 'text-embedding-%'
  );
