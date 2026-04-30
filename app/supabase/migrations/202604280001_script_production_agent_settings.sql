-- Script production agent settings

alter table public.platform_settings
drop constraint if exists platform_settings_category_check;

alter table public.platform_settings
add constraint platform_settings_category_check
check (category in ('llm', 'import', 'membership', 'consultation', 'script_production', 'knowledge'));

insert into public.platform_settings (key, category, value, description)
values
  (
    'script_production_agent',
    'script_production',
    '{
      "model": "gpt-4.1-mini",
      "temperature": 0.65,
      "retrievalTopK": 4,
      "revisionEnabled": true
    }'::jsonb,
    'Platform-level script production agent settings.'
  )
on conflict (key) do nothing;
