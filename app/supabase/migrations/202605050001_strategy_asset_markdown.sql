alter table public.merchant_strategy_assets
  add column if not exists strategy_markdown text not null default '',
  add column if not exists canonical_snapshot jsonb,
  add column if not exists compiled_context jsonb;

update public.merchant_strategy_assets
set strategy_markdown = trim(both from concat_ws(
  E'\n\n',
  '# 商家策略资产',
  case
    when nullif(strategy_snapshot->>'positioning', '') is not null
      then concat('## 当前定位', E'\n', strategy_snapshot->>'positioning')
    else null
  end,
  case
    when jsonb_typeof(strategy_snapshot->'targetAudiences') = 'array'
      and jsonb_array_length(strategy_snapshot->'targetAudiences') > 0
      then concat(
        '## 高价值用户洞察',
        E'\n',
        (
          select string_agg(concat('- ', value), E'\n')
          from jsonb_array_elements_text(strategy_snapshot->'targetAudiences') as audience(value)
        )
      )
    else null
  end,
  case
    when jsonb_typeof(strategy_snapshot->'coreSellingPoints') = 'array'
      and jsonb_array_length(strategy_snapshot->'coreSellingPoints') > 0
      then concat(
        '## 核心卖点',
        E'\n',
        (
          select string_agg(concat('- ', value), E'\n')
          from jsonb_array_elements_text(strategy_snapshot->'coreSellingPoints') as selling_point(value)
        )
      )
    else null
  end,
  case
    when jsonb_typeof(strategy_snapshot->'keyScenes') = 'array'
      and jsonb_array_length(strategy_snapshot->'keyScenes') > 0
      then concat(
        '## 核心场景',
        E'\n',
        (
          select string_agg(concat('- ', value), E'\n')
          from jsonb_array_elements_text(strategy_snapshot->'keyScenes') as scene(value)
        )
      )
    else null
  end,
  case
    when nullif(strategy_snapshot->>'currentSuggestion', '') is not null
      then concat('## 当前建议', E'\n', strategy_snapshot->>'currentSuggestion')
    else null
  end,
  '## 待验证想法' || E'\n' || '- 后续咨询中继续补充。'
))
where strategy_markdown = '';

update public.merchant_strategy_assets
set canonical_snapshot = strategy_snapshot
where canonical_snapshot is null;
