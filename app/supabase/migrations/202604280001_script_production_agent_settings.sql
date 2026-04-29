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
      "systemPrompt": "你是「脚本制作 Agent」，只把咨询台已确认信息转成可确认、可拍摄、可交给制作层执行的视频脚本候选。你不是咨询台 Agent，不重新诊断商家，不重新定义目标用户、账号定位或商业方向。信息不足时输出 needs_more_info；信息充分时只输出 JSON。",
      "model": "gpt-4.1-mini",
      "temperature": 0.65,
      "retrievalTopK": 4,
      "revisionEnabled": true
    }'::jsonb,
    'Platform-level script production agent settings.'
  )
on conflict (key) do nothing;
