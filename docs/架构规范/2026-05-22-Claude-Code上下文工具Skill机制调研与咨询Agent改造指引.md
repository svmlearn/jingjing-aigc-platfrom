# Claude Code 上下文 / 工具 / Skill 机制调研与咨询 Agent 改造指引

日期：2026-05-22  
状态：调研结论与改造指引，暂不直接改造  
目标读者：后续没有聊天上下文的 AI 执行者

## 1. 本文目标

这份文档只做一件事：把 `references/open-source/claude-code项目/claude-code-main` 中和上下文、工具、Skill、多轮消息相关的关键设计挖出来，并翻译成当前咨询 Agent 可以执行的改造指引。

后续执行者的质量标准：

1. 不需要读本轮聊天记录，只读本文和文中引用的源码位置，就能知道为什么要改。
2. 不把“用户资料 / 历史消息”误做成 LLM 可见工具。
3. 不把 Skill 正文每轮用启发式重复塞进 system prompt。
4. 不为了让工具调用“看起来成功”而 strip 多余字段；严格校验仍然保留。
5. 改完以后，商家前台不再看到伪工具失败卡片，模型也不再被伪工具目录牵着走。

## 2. 证据索引

本节列出后续 AI 必须优先打开的参考文件。

### 2.1 Claude Code 参考仓库

1. `references/open-source/claude-code项目/claude-code-main/src/QueryEngine.ts`
   - `180-199`：一个 `QueryEngine` 对应一段 conversation；`mutableMessages`、权限拒绝、文件缓存等状态跨 turn 保存；`discoveredSkillNames` 是 turn 级状态。
   - `211-240`：每次 `submitMessage()` 开启新 turn，并清空本 turn 的 skill discovery 集合。
   - `287-328`：每个 turn 重新组装 system prompt，但 system prompt 是 default/custom/memory mechanics/append 的组合，不是把全部动态业务事实塞进去。
   - `338-377`：`processUserInputContext` 明确携带 `messages: this.mutableMessages`、`dynamicSkillDirTriggers`、`discoveredSkillNames` 等上下文。

2. `references/open-source/claude-code项目/claude-code-main/src/query.ts`
   - `203-217`：query loop 的 `State` 显式保存 `messages`、`toolUseContext`、压缩恢复状态和 turn 计数。
   - `241-279`：`queryLoop()` 从 `params.messages` 初始化状态。
   - `297-304`：memory prefetch 每个用户 turn 启动一次，输入是当前 `state.messages`。
   - `323-335`：skill discovery prefetch 是每轮 loop 迭代的后台发现机制，不是直接把多个 skill 正文塞进 system。
   - `659-664`：真正调用模型时传入 `messages: prependUserContext(messagesForQuery, userContext)`、`systemPrompt`、`tools`。
   - `742-780`：只对对外可观察消息 clone/backfill，原始 assistant message 不改，避免 prompt cache 字节不一致。
   - `1588-1630`：memory / skill discovery 结果以 attachment message 形式追加到 `toolResults`，不是改写 system prompt。
   - `1717-1730`：下一轮 loop 的消息是 `messagesForQuery + assistantMessages + toolResults`，也就是正常消息流。

3. `references/open-source/claude-code项目/claude-code-main/src/context.ts`
   - `113-149`：`getSystemContext()` 是会话级 memoize 的 context，包含 gitStatus/cacheBreaker 等。
   - `152-188`：`getUserContext()` 是会话级 memoize 的 user context，包含 `claudeMd` 和 current date。

4. `references/open-source/claude-code项目/claude-code-main/src/utils/api.ts`
   - `449-474`：`prependUserContext()` 会把 user context 包成一个 meta user message，内容在 `<system-reminder>` 中，然后再接真实消息历史。

5. `references/open-source/claude-code项目/claude-code-main/docs/extensibility/skills.mdx`
   - `9-17`：Tool 是原子执行动作；Skill 是 prompt + 权限配置的声明式工作流。
   - `66-97`：Skill frontmatter 包括 `when_to_use`、`allowed-tools`、`context: fork` 等字段。
   - `99-127`：inline Skill 的 prompt 注入为 UserMessage；fork Skill 在独立子 Agent 中执行。
   - `147-159`：Skill 列表注入 system prompt 时有 1% context window 预算、单条上限和降级策略。
   - `161-176`：动态发现与路径条件激活，不是全量正文常驻 prompt。
   - `203-220`：Skill 生命周期：`SKILL.md -> Command -> list in system prompt -> AI 选择 Skill -> SkillTool.validateInput -> permissions -> SkillTool.call -> contextModifier -> record usage`。

6. `references/open-source/claude-code项目/claude-code-main/docs/conversation/multi-turn.mdx`
   - `15-23`：`QueryEngine` 内部状态包含跨 turn 的 `mutableMessages` 和 turn 级 `discoveredSkillNames`。
   - `26-59`：`submitMessage()` 每次用户输入一条消息，清理 turn 状态，组装 prompt，然后调用 `query({ systemPrompt, messages: this.mutableMessages, tools })`。

7. `references/open-source/claude-code项目/claude-code-main/docs/conversation/the-loop.mdx`
   - `25-38`：模型调用前有工具结果预算、历史 snip、microcompact、context collapse、autocompact 的串行管道。
   - `40-64`：流式模型输出中收集 assistant message 和 tool_use，工具结果合并进下一轮 loop。
   - `70-95`：loop 明确区分终止条件和继续条件。

8. `references/open-source/claude-code项目/claude-code-main/docs/context/project-memory.mdx`
   - `142-166`：`MEMORY.md` 内容作为 user context message 注入，不作为普通 system prompt 常驻内容。

### 2.2 当前项目需要对照的文件

1. `app/src/contracts/knowledge.ts:1-9`：当前 `ConsultationAgentToolKey` 里仍包含 `read_merchant_profile`、`read_history`。
2. `app/src/server/api/consultation-runtime/tools.ts:167-301`：当前 runtime registry 把 `read_merchant_profile` 和 `read_history` 注册成工具。
3. `app/src/server/api/consultation-runtime/tools.ts:622-633`：业务工具目录从 registry 生成 system prompt。
4. `app/src/server/api/consultation-runtime/planner.ts:37-44`：planner 固定工具顺序仍包含两个伪工具。
5. `app/src/server/api/consultation-runtime/planner.ts:244-260`：依赖图把真实写入工具依赖在伪读工具上。
6. `app/src/server/api/consultation-runtime/skills.ts:34-47`：当前 active skills 是按用户文本启发式选出来的。
7. `app/src/server/api/consultation-runtime/skills.ts:203-225`：当前候选 Skill 列表是 system prompt 里的简短说明。
8. `app/src/server/api/consultation-runtime/skills.ts:227-242`：当前 active Skill 正文会直接追加到 system prompt。
9. `app/src/server/api/consultation-service.ts:489-531`：当前已经能拿到 `previousMessages`、`allUserMessages`、`conversationMessages`。
10. `app/src/server/api/consultation-service.ts:1203-1260`：`runConsultationAgentLoop()` 在 turn 开始时启发式选择 active skills。
11. `app/src/server/api/consultation-service.ts:1768-1840`：普通回复路径把 merchant/userMessage/strategySnapshot/currentKnowledgeMatches 打包成单个 user JSON。
12. `app/src/server/api/consultation-service.ts:1922-1980`：native tool calling 路径同样把当前输入和上下文打包成单个 user JSON。
13. `app/src/server/api/consultation-runtime/context.ts:262-325`：slim context pack 当前的 included 字段仍是 `merchant/userMessage/round/expertRouting/strategySnapshot/currentKnowledgeMatches`。
14. `app/src/lib/db/platform-admin-repository.ts:143-158`：默认 enabled tools 仍包含两个伪工具。
15. `app/src/components/platform-admin/platform-settings-editor.tsx:22-48`：平台设置 UI 仍把两个伪工具展示成可勾选能力。
16. `app/src/server/api/schemas.ts:5-13`：平台设置 schema 仍允许这些工具 key。

## 3. Claude Code 的关键架构事实

### 3.1 多轮会话不是“每轮一个大 JSON”

Claude Code 的核心结构是：conversation 有一个跨 turn 的消息数组，用户每发一条消息就触发一次 `submitMessage()`。`queryLoop()` 内部再根据工具调用情况进行多次迭代。

关键点：

1. 历史消息是 `messages`，不是伪工具。
2. 工具结果是 message flow 的一部分，执行后追加到下一轮 loop。
3. memory / skill discovery 的后台结果也是 attachment message，不是改 system prompt。
4. 动态上下文可以用 meta user message 前置，但真实用户输入仍应该是独立 user message。

对咨询 Agent 的含义：

1. `merchant`、`conversation summary`、`strategySnapshot`、`selectedKnowledgeMatches` 可以整理成受控上下文消息。
2. 当前用户原话不要只藏在 JSON 字段 `userMessage` 里；应该保留为一个正常 user message。
3. 历史消息不应该再伪装成 `read_history` 工具；如果上下文太长，应做摘要 / 截断 / compact，而不是让模型“调用工具读取历史”。

### 3.2 system prompt 和 user context 分层明确

Claude Code 每 turn 会重新组装 system prompt，但它没有把所有动态业务事实都放进 system prompt。`getUserContext()` 生成的 CLAUDE.md/current date 这类用户上下文，会通过 `prependUserContext()` 包成 meta user message 放在消息最前面。

这对当前项目很重要：

1. `agent systemPrompt` 和 `soul.md` 应保持为稳定人格 / 任务边界，不应频繁混入商家动态事实。
2. 商家资料、策略资产、会话摘要、当前轮 selected evidence 应作为 runtime context message。
3. runtime context message 可以是 meta user message 或项目当前 `ChatMessage` 能表达的 user message，但要和真实用户消息分开。

推荐目标形态：

```ts
[
  { role: "system", content: buildStableSystemPrompt(...) },
  { role: "user", content: buildConsultationRuntimeContextMessage(...), meta: true },
  ...conversationMessagesBeforeCurrentTurn,
  { role: "user", content: currentUserContent },
]
```

如果当前 `ChatMessage` 类型不支持 `meta`，也先用明确标题包裹：

```text
<consultation-runtime-context>
# merchantProfile
...
# strategySnapshot
...
# conversationSummary
...
</consultation-runtime-context>
```

然后紧接真实用户消息，不要继续塞一个大 JSON 当唯一 user message。

### 3.3 Tool 和 Skill 的边界不能混

Claude Code 的文档把 Tool 和 Skill 分得很清楚：

1. Tool 是原子动作，有实际执行逻辑，例如读文件、写文件、运行命令。
2. Skill 是 prompt + 权限配置，表示某类复杂工作流。
3. Skill 列表可以进入 system prompt，但必须短、预算受控。
4. Skill 正文不是靠启发式每轮塞 system prompt；是 AI 选择 Skill 后，由 `SkillTool` 执行 inline 或 fork。

对咨询 Agent 的含义：

1. `read_merchant_profile` 不是 Tool。商家资料本来就在 runtime state 中，每轮应该自动注入。
2. `read_history` 不是 Tool。历史消息 / 摘要本来就在 session 中，应该自动注入或 compact。
3. `retrieve_knowledge_base` 是 Tool。它有实际检索动作，且不是每轮信息都必须预置。
4. `search_benchmark_materials` 是 Tool。它访问外部/缓存素材库，并写入社媒爆款内容库。
5. `update_strategy_snapshot` 是 Tool。它触发受控策略资产编辑。
6. `update_content_calendar` 是 Tool。它触发内容日历写入。
7. `generate_article_brief` / `generate_video_brief` 当前更像团队工作台派生流程，不应该暴露给咨询主模型，除非单独设计成后置任务。

### 3.4 严格工具校验是正确的，不要用 strip 掩盖问题

Claude Code 在 `query.ts:742-780` 的做法是：需要对外展示时 clone/backfill；原始 assistant message 不随便改，因为这会影响 prompt cache 和可恢复性。

迁移到当前项目时，要区分两件事：

1. LLM 通过 native tool call 输出的 arguments 是模型事实，应该按 schema 严格校验。
2. runtime 内部如果要补齐默认值，应发生在 validate 成功后，或者由 `buildConsultationToolArgs()` 合并受控默认值。

不推荐做法：

1. 不要对 LLM 原始 arguments 做 `.strip()` 让错误调用假装成功。
2. 不要在工具描述里写“不要输出 currentSuggestion / strategyTags / contentCalendarGenerationStatus”等负面字段列表。
3. 不要把内部字段名暴露给模型，然后再指望模型不输出。

推荐做法：

1. Zod schema 继续 `.strict()`。
2. 工具描述只写允许字段，例如“arguments 只包含 merchantId、round、stage”。
3. validation rejected 可以进入 runtime trace/debug，但不应作为商家可见失败卡片打断对话。
4. 如果将来需要兼容旧模型输出，只能作为显式 migration/compat 层记录，不要默默吞字段。

## 4. 当前咨询 Agent 的主要偏差

### 4.1 两个伪工具会误导模型

当前 `read_merchant_profile` 和 `read_history` 同时出现在：

1. 类型定义：`app/src/contracts/knowledge.ts:1-9`
2. runtime registry：`app/src/server/api/consultation-runtime/tools.ts:167-301`
3. planner 顺序和依赖：`app/src/server/api/consultation-runtime/planner.ts:37-44`、`244-260`
4. 默认设置：`app/src/lib/db/platform-admin-repository.ts:143-158`
5. 平台 UI：`app/src/components/platform-admin/platform-settings-editor.tsx:22-48`
6. settings schema：`app/src/server/api/schemas.ts:5-13`

结果是模型以为“读取用户信息 / 读取历史内容”是需要调用的工具。实际上这些内容 runtime 已经有了，而且每轮都应该让模型看到。

### 4.2 单个 user JSON 破坏了消息语义

当前普通回复路径和 native tool calling 路径都构造了类似结构：

```json
{
  "merchant": {},
  "userMessage": "...",
  "round": 3,
  "expertRouting": {},
  "strategySnapshot": {},
  "currentKnowledgeMatches": []
}
```

问题：

1. 真实用户输入被降级成 JSON 字段，不再是自然的 user message。
2. 商家资料、策略资产、证据、用户原话混在同一层，后续很难做缓存、预算和 compact。
3. 模型容易把 JSON 顶层字段当成要输出或要维护的协议字段。
4. 后续工具结果和 selected evidence 的权威来源不清晰。

### 4.3 active Skill 现在是启发式 system 注入

当前 `selectActiveConsultationSkills()` 会根据当前用户文本和最近 3 条用户消息打分，最多选 3 个 active skill；`buildActiveSkillPrompt()` 再把正文直接塞进 system prompt。

这和 Claude Code 的 SkillTool 机制不同：

1. Claude Code 的候选列表是短说明，且有预算。
2. Skill 正文只有在 AI 选择 Skill 后才进入消息流。
3. inline Skill 是 UserMessage，fork Skill 是子 Agent。
4. turn 级 discovery 状态会清理，避免无边界增长。

当前风险：

1. 某个关键词连续出现时，Skill 正文可能多轮重复注入。
2. 多个 Skill 正文被动注入会使模型变僵硬。
3. system prompt 同时承载人格、规则、工具目录、上下文包说明、Skill 正文，层级过重。

## 5. 目标架构

### 5.1 LLM 可见工具清单

下一步改造后，咨询主模型可见工具建议只保留：

1. `retrieve_knowledge_base`
2. `search_benchmark_materials`
3. `update_strategy_snapshot`
4. `update_content_calendar`

暂不作为咨询主模型可见工具：

1. `read_merchant_profile`：改为自动上下文。
2. `read_history`：改为自动上下文 / 摘要 / compact。
3. `generate_article_brief`：后置图文工作台派生任务，不进入咨询主模型工具目录。
4. `generate_video_brief`：后置视频工作台派生任务，不进入咨询主模型工具目录。

### 5.2 自动上下文分层

把当前大 JSON 拆成 5 类自动上下文。

1. `merchantProfileContext`
   - 来源：`MerchantProfileDto`
   - 内容：商家/用户名称、行业、serviceItems、brandSummary、regionSummary、toneStyle、defaultCta、禁忌或偏好。
   - 注意：这是每个商家的动态上下文，不属于专家 `systemPrompt` / `soul.md`。

2. `conversationContext`
   - 来源：`conversationMessages`、`session.summaryText`、当前 round。
   - 内容：最近 N 轮 user/assistant 摘要或原文、会话摘要、当前轮编号。
   - 注意：历史消息长了以后做 compact，不做 `read_history` 工具。

3. `strategySnapshotContext`
   - 来源：`StrategySnapshotDto` 和 `strategyMarkdown`。
   - 内容：右侧策略资产的当前权威快照。
   - 注意：只告诉模型这是当前资产状态，不暴露内部 generation/debug 字段。

4. `selectedKnowledgeContext`
   - 来源：`knowledgeMatches` 经 `buildSelectedKnowledgeMatches()` 筛选后的本轮证据。
   - 内容：只包含本轮 selected evidence。
   - 注意：未 selected 的历史命中不能当成本轮依据。

5. `expertRoutingContext`
   - 来源：`mentionRouting`、专家容器信息。
   - 内容：当前由哪个专家接管、为什么接管、是否清理 mention。
   - 注意：这是 routing context，不要暴露给用户。

### 5.3 消息数组目标形态

普通回复和 native tool calling 应该共享同一个 message builder。区别只在是否传 `tools` 和是否加入 native loop 运行规则。

建议新增或改造：

```ts
function buildConsultationModelMessages(input: {
  state: ConsultationAgentLoopState;
  phase: "assistant_reply" | "native_tool_calling";
  toolResults?: ConsultationAgentToolResult[];
}): ChatMessage[]
```

输出顺序：

```ts
[
  {
    role: "system",
    content: [
      consultationAgent.systemPrompt,
      buildAgentSoulPrompt(...),
      buildExpertContainerPrompt(...),
      buildSkillCatalogPrompt(...),
      buildBusinessToolPrompt(visibleTools),
      buildPhaseRuntimeRules(phase),
    ].filter(Boolean).join("\n"),
  },
  {
    role: "user",
    content: buildConsultationRuntimeContextMessage({
      merchantProfileContext,
      conversationContext,
      strategySnapshotContext,
      selectedKnowledgeContext,
      expertRoutingContext,
      toolResults,
    }),
  },
  ...input.state.conversationMessages.slice(/* before current source message */),
  {
    role: "user",
    content: input.state.userContent,
  },
]
```

如果为了避免重复当前用户消息，`conversationMessages` 已经包含当前 source user message，则 builder 要明确：

1. 历史消息使用 `session.messages` / `previousMessages`，不含当前 source message。
2. 当前用户消息最后单独追加。

当前代码里 `processConsultationReply()` 已经有：

1. `previousMessages = effectiveSession.messages.slice(0, sourceMessageIndex)`
2. `messagesThroughSource = effectiveSession.messages.slice(0, sourceMessageIndex + 1)`
3. `conversationMessages` 从 `messagesThroughSource` 构造

执行者需要把这里整理清楚，避免当前用户消息出现两次。

### 5.4 Skill 目标形态

短期目标不要一次性实现完整 Claude Code SkillTool，但要先修掉“正文反复塞 system”的问题。

推荐分两步。

第一步：保留短候选目录，移除主动正文注入。

1. `buildSkillCatalogPrompt()` 继续保留，但加预算：总字数上限约 6k-8k，单个 skill description/whenToUse 上限 160-250 字符。
2. `buildActiveSkillPrompt()` 不再由启发式自动进入 system prompt。
3. runtime trace 仍可记录候选 skill、启发式命中、推荐 skill，但不要自动把正文喂给主模型。

第二步：设计一个显式 Skill 激活机制。

方案 A：新增 LLM 可见工具 `activate_consultation_skill`

1. 工具参数只包含 `skillId` 或 `skillKey`。
2. 工具结果返回该 skill 的正文，作为 tool result message 进入后续 loop。
3. 每 turn 最多激活 1 个，必要时最多 2 个。
4. 激活过的 skill 记录在 turn state，下一 turn 清空。

方案 B：内部 selector 生成 attachment message

1. 模型先看到短目录。
2. runtime 根据模型意图或内部规则选择一个 skill。
3. 以 meta user message / attachment message 注入正文。
4. 不能放进 system prompt。

优先建议方案 A，因为更接近 Claude Code 的“AI 选择 Skill -> SkillTool.call() -> 注入 UserMessage / fork”的链路，也更容易审计为什么某个 skill 被使用。

暂不做：

1. 不要实现 fork sub-agent，除非后面真的有长任务型咨询 Skill。
2. 不要让 Skill 正文常驻 system prompt。
3. 不要在 prompt 里写“不要激活 X skill”这种负面目录。

## 6. 文件级改造清单

后续执行 AI 应按这个顺序改，不要只改一两个文件。

### 6.1 合同与配置

1. `app/src/contracts/knowledge.ts`
   - 从面向平台设置 / LLM 可见工具类型中移除 `read_merchant_profile`、`read_history`。
   - 如果历史数据仍可能含旧 key，新增兼容类型或 normalize 函数，不要让旧 key 进入 LLM tools。

2. `app/src/server/api/schemas.ts`
   - settings schema 不再允许新提交 `read_merchant_profile`、`read_history`。
   - 如果要兼容旧 DB，可在 repository 层过滤，不在 schema 暴露。

3. `app/src/lib/db/platform-admin-repository.ts`
   - 默认 `enabledTools` 移除两个伪工具。
   - `toConsultationToolArray()` 读取旧配置时过滤旧 key。
   - 确认空数组 fallback 到新默认值。

4. `app/src/components/platform-admin/platform-settings-editor.tsx`
   - UI 不展示两个伪工具。
   - 可以在说明文案里写“用户资料与历史会话由 runtime 自动纳入上下文”，但不要作为可勾选工具。

5. migrations / seed
   - 搜索 `read_merchant_profile`、`read_history`。
   - 旧 migration 不必重写历史，但新 seed/default 不能继续写入伪工具。

### 6.2 Runtime tools

1. `app/src/server/api/consultation-runtime/tools.ts`
   - registry 中移除或内部隐藏 `read_merchant_profile`、`read_history`。
   - `isLlmVisibleConsultationTool()` 必须返回 false，最好类型层面就不再进入 visible list。
   - `isRepeatableConsultationReadTool()` 只保留真正可重复的 `retrieve_knowledge_base`，必要时 `search_benchmark_materials` 另行判断。
   - `buildBusinessToolPrompt()` 只展示 LLM 可见真实工具。
   - `buildRuntimeToolDescription()` 继续使用正向字段说明，不列内部禁止字段。
   - `parseNativeConsultationToolCall()` 对未知 / 不可见工具仍拒绝，并进入 trace，不进入商家失败卡片。

2. `buildConsultationToolArgs()`
   - 删除 `read_history` 分支。
   - 保留对真实工具的受控默认值补齐。
   - `update_strategy_snapshot` 仍由内部 Editor 根据上下文改写，不让主模型直接传大字段。

### 6.3 Planner

1. `app/src/server/api/consultation-runtime/planner.ts`
   - `orderedTools` 移除 `read_merchant_profile`、`read_history`。
   - `getToolDependencies()` 改为：

```ts
retrieve_knowledge_base -> []
search_benchmark_materials -> []
update_strategy_snapshot -> ["retrieve_knowledge_base"] // 如果当前场景确实需要依据；不要依赖伪工具
update_content_calendar -> ["update_strategy_snapshot"]
```

   - 如果用户明确只是在闲聊或追问资料，planner 可以 stop，不要为了满足依赖先执行伪读工具。
   - planner prompt 里删除“read_history、read_merchant_profile 是读类工具”的说明。

### 6.4 Context builder

1. `app/src/server/api/consultation-runtime/context.ts`
   - 保留 `buildConsultationSlimContextPack()` 的预算 / selected evidence 能力。
   - 新增 `buildConsultationRuntimeContextMessage()` 或类似函数，负责把 5 类上下文渲染成清晰文本块。
   - `included` 不再把 `userMessage` 当 context 字段；用户原话是独立 user message。
   - `merchant` 改名为 `merchantProfileContext` 或在渲染层使用明确标题。
   - `runtimeSnapshot/debug` 只进 trace，不进模型可见上下文，除非明确需要。

2. `buildSlimContextPackSystemPrompt()`
   - 缩短为规则摘要，避免解释太多内部字段。
   - 不再说“主模型只能把 user JSON 顶层 strategySnapshot...”这类依赖大 JSON 的规则。
   - 改成“策略资产权威入口是 runtime context 中的 strategySnapshotContext”。

### 6.5 Service message builders

1. `app/src/server/api/consultation-service.ts`
   - 合并 `buildAssistantReply`、`buildNativeToolCallingMessages`、`buildJsonToolLoopMessages` 中重复的 system/context/user 结构。
   - 当前用户消息必须作为最后一个正常 user message。
   - 自动上下文必须和当前用户消息分离。
   - native tool calling 的系统规则只补 native loop 行为，不改变上下文结构。

2. `runConsultationAgentLoop()`
   - 不再用 `selectActiveConsultationSkills()` 自动把 active skill 正文放入 `consultationAgent.activeSkills` 并进入 system。
   - 可以保留 `candidateSkills` 和 trace 记录，用于后续 skill activation。

3. `runConsultationTool()`
   - 移除 `read_merchant_profile` 和 `read_history` 的执行分支，或仅作为旧 trace 兼容，不可被 planner/native tools 调到。
   - 如果保留兼容分支，必须注释“legacy internal only”，并测试 LLM 看不到。

### 6.6 Skill

1. `app/src/server/api/consultation-runtime/skills.ts`
   - `buildSkillCatalogPrompt()` 加总预算和单项截断。
   - `buildActiveSkillPrompt()` 停止在 system prompt 中使用，或者改名为 `buildSkillActivationAttachment()` 并只用于 tool result / context attachment。
   - `selectActiveConsultationSkills()` 不再作为默认注入依据；最多作为 trace hint。

2. 如果实现 `activate_consultation_skill`
   - 新增 tool schema 严格只允许 `skillKey` 或 `skillId`。
   - tool result 返回 skill 正文摘要 / 全文上限。
   - 每 turn 激活上限写在 runtime state。
   - 商家前台不显示该内部 skill 激活卡片，或显示为极简“已引用方法论”。

### 6.7 测试

至少更新 / 新增以下测试。

1. `app/src/server/api/consultation-service.test.ts`
   - 断言 native tools source / runtime tools 不再包含 `read_merchant_profile`、`read_history`。
   - 断言 `buildBusinessToolPrompt()` 不列出两个伪工具。
   - 断言 strict schema 仍存在。
   - 断言工具描述只写允许字段，不写“不要输出 X 字段”。
   - 断言 rejected native tool call 不生成商家可见 failed tool card。

2. 新增 context builder 单测
   - 输入 merchant、history、strategySnapshot、selectedKnowledgeMatches。
   - 输出包含独立上下文块。
   - 输出不包含 `userMessage` JSON 顶层结构。
   - 当前用户内容由单独 user message 承载。

3. 新增 planner 单测
   - enabledTools 含旧 key 时会被过滤。
   - planner ordered tools 不含伪工具。
   - `update_strategy_snapshot` 不依赖 `read_merchant_profile` / `read_history`。

4. 新增 Skill 单测
   - 候选 Skill 列表有预算上限。
   - 未显式激活时，system prompt 不包含 Skill 正文。
   - 如果实现 activation tool，tool result 才包含 Skill 正文。

## 7. 验收标准

改造完成后必须满足：

1. LLM native `tools` 数组不包含 `read_merchant_profile`、`read_history`。
2. system prompt 的业务工具目录不包含 `read_merchant_profile`、`read_history`。
3. 平台设置 UI 不再把二者作为可勾选工具。
4. 旧 DB/settings 中即使还残留旧 key，也会在 runtime normalize 时过滤。
5. 商家资料和历史会话通过自动 runtime context 进入模型。
6. 当前用户消息是独立 user message，不再只作为 JSON 字段。
7. `strategySnapshot` 的权威入口是 runtime context 中的策略资产块，而不是 user JSON 顶层字段。
8. `currentKnowledgeMatches` 只表示本轮 selected evidence，未 selected 的历史命中不能被当成本轮依据。
9. Skill 正文不再每轮凭启发式塞进 system prompt。
10. 工具参数 schema 保持 strict；错误字段会被拒绝和记录，不会被 strip 成成功。
11. 内部 validation / rejected trace 不会渲染成商家可见失败卡片。
12. 不修改 `agent systemPrompt` 和 `soul.md` 的真实内容，除非用户单独要求。

## 8. 禁止做法

1. 不要为了减少报错而把工具 schema 从 `.strict()` 改成 `.strip()`。
2. 不要在 prompt 里列“不要输出 D/E/F 字段”；只告诉模型允许输出 A/B/C。
3. 不要把 `read_merchant_profile` 和 `read_history` 改名后继续作为 LLM 可见工具。
4. 不要把商家动态资料写进专家 system prompt 或 soul。
5. 不要继续用一个大 user JSON 同时承载上下文和当前用户消息。
6. 不要把 Skill 正文塞进 system prompt 常驻。
7. 不要删除 runtime trace/debug；只是把商家可见展示和内部调试分开。
8. 不要重写历史 migration 造成不可控 diff；新默认值和读取 normalize 处理即可。

## 9. 推荐执行顺序

后续 AI 按这个顺序做最稳：

1. 先加 source-level 测试，锁定 `read_merchant_profile` / `read_history` 不可见。
2. 改合同、schema、默认设置、平台 UI，确保配置层不再产生伪工具。
3. 改 tools registry、business prompt、native tools builder，确保模型看不到伪工具。
4. 改 planner 顺序和依赖，去掉伪读工具依赖。
5. 新增 runtime context message builder，并让 assistant reply / native tool calling 共用它。
6. 把当前用户消息从 JSON 字段拆出来，作为独立 user message。
7. 停止 active Skill 正文进入 system prompt；保留短目录和 trace。
8. 跑 `node --test src/server/api/consultation-service.test.ts`、`pnpm typecheck`、`pnpm lint`。
9. 用一条“最近选题”类真实对话手动验证：不应出现伪工具失败卡片，不应反复追问“你是否有素材”，能直接基于上下文继续讨论。

## 10. 给后续执行者的最小改造口径

如果只能做一轮小改，优先做这 4 件：

1. 从 LLM 可见工具、业务工具目录、planner 中移除 `read_merchant_profile`、`read_history`。
2. 新增自动 runtime context message，把 merchant/profile/history/strategy/evidence 注入。
3. 当前用户消息独立成 user message，别再只放进 JSON。
4. 停止把 active Skill 正文自动塞进 system prompt。

这 4 件比继续打磨工具描述更关键。工具描述只能缓解模型输出错误字段；伪工具和大 JSON 才是导致对话僵硬的结构性问题。
