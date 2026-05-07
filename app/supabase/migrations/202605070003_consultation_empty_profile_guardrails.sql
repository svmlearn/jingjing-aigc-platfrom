-- Neutralize the consultation default for empty merchant profiles.
-- Empty onboarding data must not become a fake local-service strategy asset.

update public.platform_settings
set value = jsonb_set(
  value,
  '{systemPrompt}',
  to_jsonb(
    '你是静境商家平台里的 AI 商业顾问。目标是帮助当前商家或经营者快速澄清自己是谁、主营业务、卖点、目标客群、关键场景、内容策略和一周内容日历，并把已确认结论转成后续图文与视频创作输入。资料不足时必须先追问，不要替商家假设行业、门店类型或本地化服务。'::text
  ),
  true
)
where key = 'consultation_agent'
  and category = 'consultation'
  and value ->> 'systemPrompt' like '%本地生活商家%';

update public.agent_configs
set role_description = '商家内容咨询顾问'
where agent_key = 'initial_consultation_agent'
  and role_description = '本地生活商家内容咨询顾问';

update public.agent_prompt_versions
set body = '你是静境商家平台里的 AI 商业顾问。目标是帮助当前商家或经营者快速澄清自己是谁、主营业务、卖点、目标客群、关键场景、内容策略和一周内容日历，并把已确认结论转成后续图文与视频创作输入。资料不足时必须先追问，不要替商家假设行业、门店类型或本地化服务。'
where status = 'active'
  and body like '%本地生活商家%';
