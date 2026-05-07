insert into public.knowledge_sets (
  set_key,
  name,
  description,
  scope,
  status,
  metadata
)
values
  (
    'dbs_business_diagnosis_knowledge',
    'DBS 商业诊断知识包',
    '咨询 Agent 用于商业模式诊断、问题消解和价值判断的 DBS 参考资料。',
    'platform',
    'enabled',
    '{"seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
  ),
  (
    'dbs_concept_deconstruction_knowledge',
    'DBS 概念拆解知识包',
    '咨询 Agent 用于概念拆解、语言校准和伪问题识别的 DBS 参考资料。',
    'platform',
    'enabled',
    '{"seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
  ),
  (
    'dbs_benchmark_analysis_knowledge',
    'DBS 对标分析知识包',
    '咨询 Agent 用于判断对标对象、模仿路径和学习边界的 DBS 参考资料。',
    'platform',
    'enabled',
    '{"seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
  ),
  (
    'dbs_goal_clarification_knowledge',
    'DBS 目标清晰化知识包',
    '咨询 Agent 用于把模糊愿望重写成可检查目标的 DBS 参考资料。',
    'platform',
    'enabled',
    '{"seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
  )
on conflict (set_key) do nothing;

insert into public.knowledge_documents (
  scope,
  title,
  source_name,
  storage_provider,
  mime_type,
  status,
  summary_text,
  metadata
)
select
  'platform',
  'DBS 商业诊断：公理与问题消解框架',
  'DBS skill reference seed',
  'inline_seed',
  'text/markdown',
  'indexed',
  '商业模式诊断、语言陷阱、假设错误、逻辑错误和信息充分性判断。',
  '{"seedKey": "dbs_diagnosis_reference", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
where not exists (
  select 1
  from public.knowledge_documents
  where metadata ->> 'seedKey' = 'dbs_diagnosis_reference'
);

insert into public.knowledge_documents (
  scope,
  title,
  source_name,
  storage_provider,
  mime_type,
  status,
  summary_text,
  metadata
)
select
  'platform',
  'DBS 概念拆解：语言校准与伪概念识别',
  'DBS skill reference seed',
  'inline_seed',
  'text/markdown',
  'indexed',
  '概念使用场景、概念还原、伪概念检测和 Question / Problem 区分。',
  '{"seedKey": "dbs_deconstruct_reference", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
where not exists (
  select 1
  from public.knowledge_documents
  where metadata ->> 'seedKey' = 'dbs_deconstruct_reference'
);

insert into public.knowledge_documents (
  scope,
  title,
  source_name,
  storage_provider,
  mime_type,
  status,
  summary_text,
  metadata
)
select
  'platform',
  'DBS 对标分析：五重过滤与模仿边界',
  'DBS skill reference seed',
  'inline_seed',
  'text/markdown',
  'indexed',
  '对标对象的赚钱性、可理解性、可模仿性、自我排除和执行检查。',
  '{"seedKey": "dbs_benchmark_reference", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
where not exists (
  select 1
  from public.knowledge_documents
  where metadata ->> 'seedKey' = 'dbs_benchmark_reference'
);

insert into public.knowledge_documents (
  scope,
  title,
  source_name,
  storage_provider,
  mime_type,
  status,
  summary_text,
  metadata
)
select
  'platform',
  'DBS 目标清晰化：愿望语法审计',
  'DBS skill reference seed',
  'inline_seed',
  'text/markdown',
  'indexed',
  '将模糊愿望改写为可指物、可否证、可检查的目标。',
  '{"seedKey": "dbs_goal_reference", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
where not exists (
  select 1
  from public.knowledge_documents
  where metadata ->> 'seedKey' = 'dbs_goal_reference'
);

insert into public.knowledge_chunks (
  document_id,
  chunk_index,
  content,
  token_count,
  metadata
)
select
  kd.id,
  0,
  'DBS 商业诊断用于判断一个方向、产品或变现结构是否成立。先消解问题，再回答问题。优先检查语言陷阱、假设错误、逻辑错误、事实前提和信息充分性。核心公理：商业模式是独立于人的客观结构；流量不等于收入；智力不直接变现，商业模式才变现；定价即产品；很多创业问题表面是策略问题，底层可能是风险、身份、资源或行动约束。输出时先给核心判断，再说明成立前提、最大不确定性、需要验证的事实，以及是否交给营销 Agent 进入内容执行。',
  220,
  '{"seedKey": "dbs_diagnosis_reference_chunk", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
from public.knowledge_documents kd
where kd.metadata ->> 'seedKey' = 'dbs_diagnosis_reference'
  and not exists (
    select 1
    from public.knowledge_chunks kc
    where kc.document_id = kd.id
      and kc.metadata ->> 'seedKey' = 'dbs_diagnosis_reference_chunk'
  );

insert into public.knowledge_chunks (
  document_id,
  chunk_index,
  content,
  token_count,
  metadata
)
select
  kd.id,
  0,
  'DBS 概念拆解用于处理用户或同行说不清楚的词，比如赛道、定位、人设、IP、爆款、价值。不要先给定义，先看这个词在不同语境里怎么被使用，再还原它从哪里来、被挪用后保留了哪些恒定特征。要区分 Question 和 Problem：有些问题只是词语空转，并不对应真实业务问题。输出时说明用户以为它是什么、不同场景里的用法、概念还原、大白话解释、是否为伪概念，以及它对当前方向判断有什么影响。',
  220,
  '{"seedKey": "dbs_deconstruct_reference_chunk", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
from public.knowledge_documents kd
where kd.metadata ->> 'seedKey' = 'dbs_deconstruct_reference'
  and not exists (
    select 1
    from public.knowledge_chunks kc
    where kc.document_id = kd.id
      and kc.metadata ->> 'seedKey' = 'dbs_deconstruct_reference_chunk'
  );

insert into public.knowledge_chunks (
  document_id,
  chunk_index,
  content,
  token_count,
  metadata
)
select
  kd.id,
  0,
  'DBS 对标分析用于判断一个账号、产品或业务是否值得学。不要因为对方粉丝多就学习，也不要直接抄标题或形式。五重过滤：他是否真的赚钱；你是否看懂他的商业模式；你是否能在资源、能力、时间和场景上模仿；是否能排除自我偏好；当前阶段是否只需要模仿执行而不急着争论业务本质。输出时给出对标对象是否合格、可学部分、不可学部分、第一步模仿路径和风险提醒。',
  220,
  '{"seedKey": "dbs_benchmark_reference_chunk", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
from public.knowledge_documents kd
where kd.metadata ->> 'seedKey' = 'dbs_benchmark_reference'
  and not exists (
    select 1
    from public.knowledge_chunks kc
    where kc.document_id = kd.id
      and kc.metadata ->> 'seedKey' = 'dbs_benchmark_reference_chunk'
  );

insert into public.knowledge_chunks (
  document_id,
  chunk_index,
  content,
  token_count,
  metadata
)
select
  kd.id,
  0,
  'DBS 目标清晰化用于把愿望语法变成可检查目标。用户说我想做个人 IP、我想变现、我想做短视频、我想成为有影响力的人时，不要立刻进入执行方案。先测试三件事：这个目标是否可指物；是否可否证；它是真终点还是中间手段。识别空转词后，将目标重写为可观测行为、验收 checklist 和下一步事实收集动作。',
  200,
  '{"seedKey": "dbs_goal_reference_chunk", "seededBy": "202605070001_consultation_dbs_skill_references"}'::jsonb
from public.knowledge_documents kd
where kd.metadata ->> 'seedKey' = 'dbs_goal_reference'
  and not exists (
    select 1
    from public.knowledge_chunks kc
    where kc.document_id = kd.id
      and kc.metadata ->> 'seedKey' = 'dbs_goal_reference_chunk'
  );

insert into public.knowledge_set_documents (knowledge_set_id, document_id)
select ks.id, kd.id
from public.knowledge_sets ks
join public.knowledge_documents kd on (
  (ks.set_key = 'dbs_business_diagnosis_knowledge' and kd.metadata ->> 'seedKey' = 'dbs_diagnosis_reference')
  or (ks.set_key = 'dbs_concept_deconstruction_knowledge' and kd.metadata ->> 'seedKey' = 'dbs_deconstruct_reference')
  or (ks.set_key = 'dbs_benchmark_analysis_knowledge' and kd.metadata ->> 'seedKey' = 'dbs_benchmark_reference')
  or (ks.set_key = 'dbs_goal_clarification_knowledge' and kd.metadata ->> 'seedKey' = 'dbs_goal_reference')
)
on conflict (knowledge_set_id, document_id) do nothing;

with refs as (
  select
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_diagnosis_reference' limit 1) as diagnosis_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_business_diagnosis_knowledge' limit 1) as diagnosis_set_id,
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_deconstruct_reference' limit 1) as deconstruct_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_concept_deconstruction_knowledge' limit 1) as deconstruct_set_id,
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_benchmark_reference' limit 1) as benchmark_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_benchmark_analysis_knowledge' limit 1) as benchmark_set_id,
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_goal_reference' limit 1) as goal_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_goal_clarification_knowledge' limit 1) as goal_set_id
)
insert into public.agent_skills (
  skill_key,
  name,
  description,
  when_to_use,
  body,
  status,
  dependencies,
  metadata
)
select
  'dbs_diagnosis',
  'DBS 商业诊断',
  '判断商业方向、变现结构、价值假设和问题本身是否成立；先消解问题，再回答问题。',
  '用户带具体商业问题、方向不确定、变现结构不清、流量和收入关系混乱，或需要判断一个 IP/产品/服务是否值得做。',
  $skill$# DBS 商业诊断

你是咨询 Agent 的商业诊断 skill。你的任务不是帮用户立刻做内容，而是判断这个方向、问题或商业模式是否成立。

## 工作原则

1. 先消解问题，再回答问题。
2. 先判断语言是否清楚，再判断策略是否正确。
3. 不把流量当成收入，不把内容执行当成商业模式。
4. 如果问题本身是假问题、空转问题或前提错误，要直接指出。
5. 如果已经进入标题、开头、脚本、排期，交给营销 Agent，不在本 skill 里完成。

## 诊断流程

1. 复述用户真实想解决的问题。
2. 检查语言陷阱：词是否模糊、问题是否偷换概念。
3. 检查假设错误：用户默认相信的前提是否成立。
4. 检查逻辑错误：流量、关注、付费、交付之间是否被混为一谈。
5. 检查事实缺口：还缺什么关键事实。
6. 输出核心判断、成立前提、最大风险、最小验证动作。

## 输出要求

输出给商家的内容必须自然、克制、可执行。不要暴露 skill 名称、reference id 或内部路径。
$skill$,
  'enabled',
  '["retrieve_knowledge_base"]'::jsonb,
  jsonb_build_object(
    'seededBy', '202605070001_consultation_dbs_skill_references',
    'source', 'dbs_platformized_seed',
    'references', jsonb_build_array(
      jsonb_build_object(
        'type', 'knowledge_document',
        'title', 'DBS 商业诊断：公理与问题消解框架',
        'documentId', refs.diagnosis_document_id,
        'usage', 'retrieve_when_active'
      ),
      jsonb_build_object(
        'type', 'knowledge_set',
        'title', 'DBS 商业诊断知识包',
        'knowledgeSetId', refs.diagnosis_set_id,
        'usage', 'retrieve_when_needed'
      )
    )
  )
from refs
on conflict (skill_key) do nothing;

with refs as (
  select
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_deconstruct_reference' limit 1) as deconstruct_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_concept_deconstruction_knowledge' limit 1) as deconstruct_set_id
)
insert into public.agent_skills (
  skill_key,
  name,
  description,
  when_to_use,
  body,
  status,
  dependencies,
  metadata
)
select
  'dbs_deconstruct',
  'DBS 概念拆解',
  '拆解用户或同行说不清楚的概念，校准语言，识别伪问题和词语空转。',
  '用户提到赛道、定位、人设、IP、爆款、价值、差异化等模糊词；或需要判断同行是否真的把概念讲清楚。',
  $skill$# DBS 概念拆解

你是咨询 Agent 的概念拆解 skill。你的任务是把模糊词从口号变成可判断的业务概念。

## 工作原则

1. 不急着下定义，先看这个词在不同场景里怎么被使用。
2. 还原概念来源，检查它被挪用后是否仍保留关键属性。
3. 区分 Question 和 Problem：有些问题只是词语空转，并不对应真实业务问题。
4. 如果同行语言不过关，要指出这可能是机会，但不能把语言洁癖误当商业机会。

## 拆解流程

1. 写出用户原话里的核心概念。
2. 列出这个概念在不同语境下的用法。
3. 还原它原本的含义和关键属性。
4. 判断当前用法是否成立。
5. 用大白话重写这个概念。
6. 说明它对领域选择、价值判断或对标判断的影响。

## 输出要求

输出要帮助用户把事情讲清楚，而不是炫耀术语。不要暴露 skill 名称、reference id 或内部路径。
$skill$,
  'enabled',
  '["retrieve_knowledge_base"]'::jsonb,
  jsonb_build_object(
    'seededBy', '202605070001_consultation_dbs_skill_references',
    'source', 'dbs_platformized_seed',
    'references', jsonb_build_array(
      jsonb_build_object(
        'type', 'knowledge_document',
        'title', 'DBS 概念拆解：语言校准与伪概念识别',
        'documentId', refs.deconstruct_document_id,
        'usage', 'retrieve_when_active'
      ),
      jsonb_build_object(
        'type', 'knowledge_set',
        'title', 'DBS 概念拆解知识包',
        'knowledgeSetId', refs.deconstruct_set_id,
        'usage', 'retrieve_when_needed'
      )
    )
  )
from refs
on conflict (skill_key) do nothing;

with refs as (
  select
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_benchmark_reference' limit 1) as benchmark_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_benchmark_analysis_knowledge' limit 1) as benchmark_set_id
)
insert into public.agent_skills (
  skill_key,
  name,
  description,
  when_to_use,
  body,
  status,
  dependencies,
  metadata
)
select
  'dbs_benchmark',
  'DBS 对标判断',
  '判断对标对象是否值得学、能学什么、不能学什么，以及第一步如何模仿。',
  '用户想找对标、学谁、模仿谁，或需要判断某个同行账号/产品/业务是否值得参考。',
  $skill$# DBS 对标判断

你是咨询 Agent 的对标判断 skill。你的任务不是找一个看起来很火的账号，而是判断这个对象是否真的值得学。

## 工作原则

1. 粉丝多不等于值得对标。
2. 能赚钱、能看懂、能模仿，才是对标的基本条件。
3. 0 到 1 阶段，模仿是正确答案，但模仿的是结构，不是表面话术。
4. 如果用户只是想通过对标逃避自己的定位问题，要拉回目标和商业模式。

## 五重过滤

1. 他赚钱吗？
2. 你看得懂他的商业模式吗？
3. 你能在资源和能力上模仿吗？
4. 你能排除自己的偏好和审美吗？
5. 当前阶段是否先模仿执行，而不是讨论宏大业务本质？

## 输出要求

输出对标是否合格、可学部分、不可学部分、第一步模仿动作、风险提醒。不要直接生成标题或脚本，必要时交给营销 Agent。
$skill$,
  'enabled',
  '["retrieve_knowledge_base"]'::jsonb,
  jsonb_build_object(
    'seededBy', '202605070001_consultation_dbs_skill_references',
    'source', 'dbs_platformized_seed',
    'references', jsonb_build_array(
      jsonb_build_object(
        'type', 'knowledge_document',
        'title', 'DBS 对标分析：五重过滤与模仿边界',
        'documentId', refs.benchmark_document_id,
        'usage', 'retrieve_when_active'
      ),
      jsonb_build_object(
        'type', 'knowledge_set',
        'title', 'DBS 对标分析知识包',
        'knowledgeSetId', refs.benchmark_set_id,
        'usage', 'retrieve_when_needed'
      )
    )
  )
from refs
on conflict (skill_key) do nothing;

with refs as (
  select
    (select id::text from public.knowledge_documents where metadata ->> 'seedKey' = 'dbs_goal_reference' limit 1) as goal_document_id,
    (select id::text from public.knowledge_sets where set_key = 'dbs_goal_clarification_knowledge' limit 1) as goal_set_id
)
insert into public.agent_skills (
  skill_key,
  name,
  description,
  when_to_use,
  body,
  status,
  dependencies,
  metadata
)
select
  'dbs_goal',
  'DBS 目标清晰化',
  '把模糊愿望重写成可检查目标，防止咨询过早进入内容执行。',
  '用户说我想做个人 IP、想做短视频、想变现、想提升影响力，但目标不可检查或缺少验收标准。',
  $skill$# DBS 目标清晰化

你是咨询 Agent 的目标清晰化 skill。你的任务是把愿望语法改写成可检查目标。

## 工作原则

1. 用户说“我想做个人 IP”时，不直接给执行方案。
2. 先判断目标是否可指物、可否证、可验收。
3. 识别空转词，比如影响力、长期主义、变现、起号、定位。
4. 把目标改写为事实、动作、时间窗口和验收 checklist。

## 审计流程

1. 记录用户原话。
2. 检查可指物性：这个目标对应什么现实对象。
3. 检查可否证性：什么情况说明它没有做到。
4. 检查终点属性：它是终点还是中间手段。
5. 输出重写目标、验收 checklist 和下一步事实收集动作。

## 输出要求

目标未清楚前，不进入标题、脚本、日历或投放建议。目标清楚后，再交给商业诊断、概念拆解、对标判断或营销 Agent。
$skill$,
  'enabled',
  '["retrieve_knowledge_base"]'::jsonb,
  jsonb_build_object(
    'seededBy', '202605070001_consultation_dbs_skill_references',
    'source', 'dbs_platformized_seed',
    'references', jsonb_build_array(
      jsonb_build_object(
        'type', 'knowledge_document',
        'title', 'DBS 目标清晰化：愿望语法审计',
        'documentId', refs.goal_document_id,
        'usage', 'retrieve_when_active'
      ),
      jsonb_build_object(
        'type', 'knowledge_set',
        'title', 'DBS 目标清晰化知识包',
        'knowledgeSetId', refs.goal_set_id,
        'usage', 'retrieve_when_needed'
      )
    )
  )
from refs
on conflict (skill_key) do nothing;

with target_agents as (
  select distinct ac.id
  from public.agent_configs ac
  left join public.agent_route_bindings rb on rb.agent_id = ac.id
  where (
      rb.route_key = 'consultation_default'
      and rb.status = 'active'
    )
    or ac.agent_key = 'initial_consultation_agent'
)
insert into public.agent_skill_bindings (
  agent_id,
  skill_id,
  status
)
select ta.id, s.id, 'enabled'
from target_agents ta
join public.agent_skills s on s.skill_key in (
  'dbs_diagnosis',
  'dbs_deconstruct',
  'dbs_benchmark',
  'dbs_goal'
)
on conflict (agent_id, skill_id) do nothing;

with target_agents as (
  select distinct ac.id
  from public.agent_configs ac
  left join public.agent_route_bindings rb on rb.agent_id = ac.id
  where (
      rb.route_key = 'consultation_default'
      and rb.status = 'active'
    )
    or ac.agent_key = 'initial_consultation_agent'
)
insert into public.agent_knowledge_set_bindings (
  agent_id,
  knowledge_set_id,
  status
)
select ta.id, ks.id, 'enabled'
from target_agents ta
join public.knowledge_sets ks on ks.set_key in (
  'dbs_business_diagnosis_knowledge',
  'dbs_concept_deconstruction_knowledge',
  'dbs_benchmark_analysis_knowledge',
  'dbs_goal_clarification_knowledge'
)
on conflict (agent_id, knowledge_set_id) do nothing;
