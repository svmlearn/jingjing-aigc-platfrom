# 2026-05-03 咨询 Runtime 与本地参考项目对照审计

## 背景

本轮按用户要求，重点检查“咨询模式”下的上下文工程和 runtime 写法，并与本地 `references/open-source/claude-code泄漏的客户端源码/claude-code-main` 进行架构级对照。

安全边界：

- 本地参考目录只用于理解架构概念，不作为生产依赖。
- 不复制参考源码实现。
- 不把本地参考路径、泄露字样或实现来源暴露到商家端 API payload / visible summary。

## 本轮发现

当前咨询模式已经有相似方向：

- Agent 容器：后台 `AgentConfig` + active prompt + skill bindings + knowledge set bindings。
- Skill 渐进式披露：先展示候选摘要，命中后注入本轮 active skill body。
- 受控业务工具：策略资产、内容日历、图文 brief、视频 brief 通过 bounded business tools 写入。
- 上下文注入：`consultation_context_injector_v1` 将商家、轮次、策略快照、知识命中、工具结果统一注入。
- 工具参数校验：策略资产 editor 使用 Zod schema 校验，失败后通过 tool result 回灌并重试一次。

主要差距：

- 当前主工具规划仍是确定性顺序 `planConsultationToolCalls`，不是模型动态选择工具、观察结果后继续规划。
- Skill 激活仍是关键词触发，不是 usage ranking / description matching / explicit invocation 的组合。
- 没有真正的子 Agent 独立上下文执行；`@专家` 是同一 runtime 内的专家容器切换。
- 没有上下文预算、压缩、摘要分层和 token accounting。
- 没有 stop hook / guardrail 机制来阻止低置信策略资产写入。
- 后台缺少“哪些 Agent 可被商家 @”和别名的显式配置。

## 本轮修正

文件：

- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`

修正：

- 移除咨询消息 `visibleSummary.agentLoop.references` 中的本地参考路径。
- 移除 `agent.loop.started` 事件 payload 中的本地参考路径。
- 将用户可见工具卡里的 `Hermes 安全上下文` 改为中性的 `受控上下文策略`。
- 将知识上下文 policy 改为 `controlled_context_chunks_only`。
- 移除 `agent.loop.started` 普通事件 payload 中的 `systemPromptPreview`，避免后台事件表长期保存 prompt 片段。
- 新增回归测试，禁止 `consultation-service.ts` 重新出现 `references/open-source`、`claude-code泄漏`、`hermes-agent` 等本地参考来源字样。
- 新增回归测试，禁止 `consultation-service.ts` 重新出现 `hermes_safe_context_block` 或 `systemPromptPreview`。

## 对照参考项目后的可借鉴模式

本地参考项目里值得抽象借鉴的不是具体代码，而是 runtime 分层：

1. Query lifecycle：一个独立 runtime 负责单轮输入、上下文组装、模型调用、工具执行、工具结果回灌、继续/停止条件和持久化。
2. Tool contract：工具有 schema、可见名称、是否只读、是否可并发、权限检查、输入校验、进度、结果映射和错误回灌。
3. Context budget：在真正发模型前做上下文投影、压缩、工具结果预算、历史摘要和 token accounting，不让所有上下文无脑进入 prompt。
4. Progressive disclosure：工具和 skill 不一次性全部塞进 prompt，而是先给候选摘要，再按命中/显式调用/路径或上下文信号加载正文。
5. Stop hooks / guardrails：模型完成后仍可经过停止钩子做阻断、补充校验或要求继续修正，而不是一生成就写入业务资产。
6. Runtime events：把 request、tool progress、tool result、compaction、permission/guardrail、final response 分成结构化事件，方便后台调试和回放。

对应到本项目，当前 `consultation-service.ts` 已经把这些模式的一部分揉在一起，但还没有形成可复用 runtime kernel。
建议下一步不要继续把逻辑堆在单个 service 文件里，而是拆成以下内部模块：

- `consultation-runtime/context.ts`：商家资料、策略资产、最近消息、RAG、skill、专家容器的上下文组装和预算。
- `consultation-runtime/tools.ts`：业务工具目录、schema、dispatch、只读/写入边界、结果摘要。
- `consultation-runtime/planner.ts`：从固定顺序升级到模型 tool-call JSON 规划与 observation loop。
- `consultation-runtime/guards.ts`：策略资产写入前的低置信拒写、敏感内容、闲聊误写、changedFields 异常。
- `consultation-runtime/events.ts`：统一记录 runtime event，区分用户可见摘要和后台 debug payload。
- `consultation-runtime/skills.ts`：skill 评分、显式触发、命中记录和正文加载。

## 验证

通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-service.test.ts docs/progress/2026-05-03-consultation-runtime-reference-audit.md
```

结果：

- 15 条测试通过。
- TypeScript typecheck 通过。
- diff whitespace 检查通过。
- 仍有 package 未声明 ESM 的既有 warning，不影响本轮结论。

## 优化优先级建议

P0：

- 保持生产 runtime 不暴露本地参考路径或泄露来源字样。
- 把 `systemPromptPreview` 从普通事件 payload 中移除或仅限后台 debug 权限读取。（本轮已从 `agent.loop.started` 移除）

P1：

- 把 `planConsultationToolCalls` 升级为“模型生成 tool call JSON -> schema 校验 -> dispatch -> observation -> 下一步决策”的小循环。
- 为 `update_strategy_snapshot` 增加低置信拒写：模型未调用工具、schema 失败、changedFields 异常、内容像闲聊时，不写策略资产。
- 给 Skill 做 usage 统计和触发评分，替代单纯关键词匹配。
- 将 `agent_test_runs / agent_runtime_snapshots` 真正接入咨询 runtime，把本轮 promptVersion、candidateSkillIds、actualSkillIds、knowledgeMatchIds、toolCallSummary、model 和失败原因写入后台可回放记录。

P2：

- 增加上下文预算器：按商家资料、策略资产、最近消息、知识片段、skill body 分桶限额。
- 增加会话摘要 / 阶段摘要，避免长期咨询只依赖最近 8 条 conversation。
- 后台 Agent Console 增加“可被 @ 专家调用”的开关、别名、展示排序。
- 后续再考虑真正的子 Agent 独立上下文执行；当前 `@专家` 先保持“同一咨询 runtime 内切换专家容器”，避免过早引入并发多 agent 状态复杂度。

## 当前状态

- 本轮未新增 Supabase migration。
- 本轮未部署 staging。
- 本轮未 push、未 merge。

## 追加执行：Phase B Runtime 模块化拆分

用户确认 `docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md` 后，按 Phase B 做了“机械拆分，不改变行为”的第一步。

新增目录：

- `app/src/server/api/consultation-runtime/`

新增模块：

- `types.ts`：集中定义 `ConsultationAgentRuntimeSettings`、`ConsultationAgentLoopState`、tool call/result、mention routing、skill disclosure 等 runtime 类型。
- `experts.ts`：负责默认 Agent / `@专家` 路由、AgentConfig 解析、active prompt、skill bindings、knowledge set bindings、model/tool override。
- `context.ts`：负责专家容器 prompt、`consultation_context_injector_v1`、共享上下文边界和知识命中可见摘要。
- `skills.ts`：负责 skill runtime 形态、关键词命中、候选 skill prompt、本轮 active skill prompt 和 progressive disclosure。
- `tools.ts`：负责受控业务工具目录和工具 prompt。
- `planner.ts`：负责当前确定性工具规划和工具参数修复。
- `utils.ts`：放置 runtime 内共享的小工具函数。

主 service 调整：

- `consultation-service.ts` 不再内联专家解析、skill 披露、上下文注入、工具目录和 planner。
- 会话落库、事件写入、策略资产 editor、工具 dispatch 和 assistant reply 仍留在 `consultation-service.ts`，避免本轮把数据库副作用也一起移动。
- `consultation-service.test.ts` 改为同时读取主 service 和 `consultation-runtime/*`，继续覆盖专家容器、共享上下文、skill/RAG/tool 边界和敏感来源禁入。

未做：

- 未引入模型动态 tool planner。
- 未新增 runtime snapshot 写库。
- 未新增 guardrail 模块。
- 未改 UI、Supabase schema、roundtable legacy 或 worker。

追加验证：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-service.test.ts app/src/server/api/consultation-runtime docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md docs/progress/2026-05-03-consultation-runtime-reference-audit.md
rg -n "references/open-source|claude-code泄漏|hermes-agent|hermes_safe_context_block|systemPromptPreview" app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime
```

结果：

- 15 条咨询 runtime 回归测试通过。
- TypeScript typecheck 通过。
- 针对本次改动文件的 ESLint 通过。
- diff whitespace 检查通过。
- production runtime 文件未命中本地参考路径、泄露来源字样、旧 policy 或 `systemPromptPreview`。

## 追加执行：Guardrail 与 Runtime Snapshot 接入

在 Phase B 模块化基础上，继续完成两个 P1 项：

新增模块：

- `app/src/server/api/consultation-runtime/guards.ts`

新增/调整能力：

- `update_strategy_snapshot` 在写入前统一经过 `guardStrategyAssetEditorPatch()`。
- 以下情况会保留原策略资产，并让工具结果变为 `skipped`：
  - editor 未调用 `update_strategy_asset_editor`。
  - editor 工具参数校验失败，重试后仍失败。
  - editor 运行异常。
  - 用户本轮更像闲聊、追问或低置信意图，但模型试图改资产。
  - editor 产物疑似包含 Markdown、JSON、编辑动作说明或内部字段名。
- `changedFields` 为空或声明了变更但字段值无实际差异时，不再声称“已更新”，策略资产保持不变。
- 工具结果 payload 增加 `guardrail` 摘要，只记录 reason、summary、warnings，不保存 prompt。
- `agent_runtime_snapshots` 接入真实咨询 runtime：
  - 新增 `recordAgentRuntimeSnapshot()` repository 写入函数。
  - 咨询 loop 成功构建回复后写入 sessionId、messageId、agentId、promptVersionId、candidateSkillIds、actualSkillIds、knowledgeSetIds、knowledgeMatchIds、toolCallSummary、model。
  - snapshot 写入失败不阻断商家端回复，只追加 `agent.runtime_snapshot.failed` 事件。

未做：

- 未新增 Supabase migration，复用已存在的 `agent_runtime_snapshots` 表。
- 未引入模型动态 planner。
- 未改 UI、roundtable legacy、worker 或发布链路。

追加验证：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/lib/db/agent-console-repository.ts
cd app && npm run typecheck
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-service.test.ts app/src/server/api/consultation-runtime app/src/lib/db/agent-console-repository.ts
rg -n "references/open-source|claude-code泄漏|hermes-agent|hermes_safe_context_block|systemPromptPreview" app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime app/src/lib/db/agent-console-repository.ts
```

结果：

- 17 条咨询 runtime 回归测试通过。
- TypeScript typecheck 通过。
- 针对本次改动文件的 ESLint 通过。
- diff whitespace 检查通过。
- production runtime / snapshot repository 文件未命中本地参考路径、泄露来源字样、旧 policy 或 `systemPromptPreview`。

## 追加执行：动态 Planner 小循环

在 guardrail 与 runtime snapshot 接入后，继续把 `planner.ts` 从“只返回固定顺序数组”升级为可回退的动态 planner。

新增/调整能力：

- `planNextConsultationToolCall()` 每次只规划下一步工具。
- 有 LLM key 时，planner 使用 `responseFormat: "json_object"` 让模型输出：
  - `action`
  - `toolName`
  - `args`
  - `reason`
- 输出会经过 `plannerDecisionSchema` 校验。
- 模型只能从 `readyTools` 里选择，不允许发明工具名。
- `getToolDependencies()` 约束工具依赖，避免内容日历、图文 brief、视频 brief 在策略资产更新前执行。
- 模型 planner 失败、JSON 校验失败、选择不可执行工具、或过早 stop 时，自动 fallback 到确定性顺序。
- service 主 loop 改为 observation-aware 循环：
  - planner 选择下一步。
  - dispatch 工具。
  - apply observation 到 state。
  - 下一轮 planner 读取已完成工具与 observation。
- `agent.tool.completed` 事件 payload 增加 `planner` trace。
- `agent.loop.completed` 和 `agent_runtime_snapshots.toolCallSummary` 增加 `plannerTrace`。

边界：

- 本轮仍不把模型 planner 变成无限自主 agent。
- 最大工具轮次仍受 `enabledTools.length` 约束。
- 没有 LLM key 时，行为回到 deterministic planner。
- 不保存 planner system prompt 或完整内部 prompt。

追加验证：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/lib/db/agent-console-repository.ts
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-service.test.ts app/src/server/api/consultation-runtime app/src/lib/db/agent-console-repository.ts docs/handoff/2026-05-03-consultation-runtime-modularization-handoff.md docs/progress/2026-05-03-consultation-runtime-reference-audit.md
rg -n "references/open-source|claude-code泄漏|hermes-agent|hermes_safe_context_block|systemPromptPreview" app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime app/src/lib/db/agent-console-repository.ts
```

结果：

- 18 条咨询 runtime 回归测试通过。
- TypeScript typecheck 通过。
- 针对本次改动文件的 ESLint 通过。
- diff whitespace 检查通过。
- production runtime / snapshot repository 文件未命中本地参考路径、泄露来源字样、旧 policy 或 `systemPromptPreview`。

## 追加执行：Completion Gate 收口

用户要求继续直到完成后，启用项目级 long-task gate，并把剩余 runtime 模块化事项收口到可验证状态。

新增模块：

- `app/src/server/api/consultation-runtime/runtime.ts`
  - 导出 `runConsultationRuntime()`，负责 agent loop 编排。
  - 导出 `buildConsultationRuntimeSnapshotRecord()`，统一生成 runtime snapshot 摘要。
- `app/src/server/api/consultation-runtime/events.ts`
  - 统一生成 `agent.loop.started`、`agent.tool.completed`、`knowledge.retrieved`、`agent.loop.completed` payload。
- `app/src/server/api/consultation-runtime/rag.ts`
  - 统一封装知识检索、embedding fallback、专家 knowledgeDocumentIds scope。

新增/调整能力：

- `consultation-service.ts` 进一步缩小职责：
  - 仍负责用户/商家/session CRUD 与最终 persistence。
  - runtime loop、planner observation、事件 payload、snapshot 构建迁入 `consultation-runtime/*`。
- Skill 激活从纯关键词过滤升级为 skill scoring：
  - `scoreConsultationSkills()` 输出分数。
  - active skill 带 `triggerReasons`。
  - runtime snapshot 记录 active skill 的 score 与触发原因。
- Context injector 增加 context budget：
  - `ContextBudgetReport`
  - `buildContextBudgetReport()`
  - `sessionSummary`
  - `char_budget_v1` 字符级分桶报告，先覆盖 merchant、strategySnapshot、currentUserMessage、sessionSummary、activeSkillBodies、knowledgeMatches、toolResults。
- `consultation-service.test.ts` 增加 skill scoring、context budget、runtime.ts 编排证据断言。

边界：

- 未新增 Supabase migration。
- 未改 merchant UI、roundtable legacy、worker 或发布链路。
- long-task gate 的 runtime 状态在 `.codex/long-task/`，不提交远端。

验证命令已纳入 `.codex/long-task/contract.json`，最终以 `check.py` 的 hard gates + 独立 verifier 为准。

最终 gate 结果：

- 时间：2026-05-03 11:33:02 +08:00
- taskId：`consultation-runtime-completion`
- completionPromise：`CONSULTATION_RUNTIME_COMPLETE`
- 状态：`complete`
- hard gates：通过
- independent verifier：通过
- gate report：`.codex/long-task/gate-report.json`（本地运行态，不提交远端）

最终验证结论：

- 19 条咨询 runtime 回归测试通过。
- TypeScript typecheck 通过。
- 针对本次改动文件的 ESLint 通过。
- diff whitespace 检查通过。
- production runtime / snapshot repository 文件未命中本地参考路径、泄露来源字样、旧 policy 或 `systemPromptPreview`。

## 追加执行：fallback 回复内部工具名泄漏修复

本地服务试用时发现：用户只问“我也不清楚你有什么建议吗？”时，初始咨询 Agent 回复里暴露了 `read_merchant_profile / read_history / update_content_calendar / generate_article_brief` 等内部工具 key，并且在信息不足时声称“已经合并到客群和内容场景里”。

定位结论：

- 主要原因不是专家 prompt 本身，而是 `buildAssistantReply()` fallback 模板会把内部 tool key 拼进商家可见回复。
- 触发路径很可能是 LLM 回复进入 `fallback_error` 或 `fallback_no_key` 后使用了模板兜底。
- 上下文装配也有次要问题：回复模型输入里的 `toolResults` / `contextInjection.sessionContext.toolResults` 带有内部 tool key，虽然 system prompt 要求“不输出内部工具名”，但这仍会增加泄漏风险。
- planner 依赖判定也有问题：`update_strategy_snapshot` 被 guard 跳过后，runtime 仍可能把它当作已完成依赖，继续执行内容日历和 brief 工具，导致“没有写入却像写入过”的错觉。

修复内容：

- `buildAgentLoopReplyHint()` 改为仅使用中文展示标签，不再拼接内部 tool key。
- `buildAssistantReply()` 增加低信息轮次识别；当用户没有给出可写入策略资产的信息时，明确“不改右侧策略资产”，并给出方向选择。
- fallback 只有在 `update_strategy_snapshot` tool result 为 `completed` 时，才会声称已写入 / 已合并策略资产。
- fallback 只有在 `update_content_calendar` 为 `completed` 时，才会声称右侧内容日历已更新。
- 给回复模型看的 `toolResults` 从 `tool: result.toolName` 改为 `label: 中文展示名`。
- `buildConsultationContextInjection()` 中的 tool result 也改为中文 label。
- `buildBusinessToolPrompt()` 的工具列表去掉 key 前缀，降低模型把内部 key 带进自然语言的概率。
- `runConsultationRuntime()` 新增 `getPlannerCompletedToolNames()`；`update_strategy_snapshot` 只有 completed 才能满足后续内容工具依赖。
- `update_strategy_snapshot` 若被 guard 跳过，runtime 本轮停止后续工具执行，避免继续生成内容日历 / brief。

追加验证：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-runtime/runtime.ts src/server/api/consultation-runtime/context.ts src/server/api/consultation-runtime/tools.ts src/server/api/consultation-service.test.ts
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime/runtime.ts app/src/server/api/consultation-runtime/context.ts app/src/server/api/consultation-runtime/tools.ts app/src/server/api/consultation-service.test.ts
```

结果：

- 21 条咨询 runtime 回归测试通过。
- TypeScript typecheck 通过。
- 针对本次修复文件的 ESLint 通过。
- diff whitespace 检查通过。

## 追加执行：去除“按轮次硬编码状态机”的可见假象

本地继续试用时发现：用户质疑“是不是应该先问实际情况”后，系统仍回复“策略已经够落地了”，顶部阶段也显示“策略沉淀完成”。这说明商家端可见体验仍像按轮次推进的硬编码状态机。

定位结论：

- 本地 `.env.local` 有 `LLM_API_KEY`，但没有 Supabase 配置，当前为 local demo runtime。
- 用当前 key 调默认 SiliconFlow `Qwen/Qwen3-32B` 最小 chat completion 返回 HTTP `401`，因此本地咨询回复大概率没有真实 LLM 参与。
- `runConsultationAgentLoop()` 旧逻辑用 `nextRound` 直接切阶段：
  - 第 1 轮：`目标客群梳理`
  - 第 2 轮：`内容策略收束`
  - 第 3 轮及以后：`策略沉淀完成`
- fallback 回复也按 round 输出“策略已经够落地了”，导致 LLM 不可用时严重伪装成 Agent 已完成诊断。
- `buildToolCards()` 对未执行的 writer tools 使用 completed 默认卡片，导致内容日历 / 图文 / 视频工具没有真实执行也显示 completed。

修复内容：

- 阶段标签不再按第 N 轮消息推进。
- runtime 初始事件阶段统一为 `咨询诊断中`。
- 最终 `currentStage` 改由真实工具结果决定：
  - 内容日历工具 completed：`策略沉淀完成`
  - 策略资产写入 completed：`策略资产待确认`
  - 否则：`实际情况确认中`
- fallback 增加咨询流程质疑识别：
  - 例如“不应该先问我的实际情况什么的吗？”
  - 回复改为承认应先问实际情况，并明确“不改右侧策略资产，不把模板当结论”。
- fallback 在策略写入未完成时，不再按 round 说“已沉淀 / 已合并 / 已完成”。
- tool cards 默认不再把未执行 writer tools 标为 completed：
  - `update_strategy_snapshot` 默认 skipped
  - `update_content_calendar` 默认 skipped
  - `generate_article_brief` 默认 skipped
  - `generate_video_brief` 默认 skipped

实际接口验证：

```bash
curl -sS -H 'Content-Type: application/json' \
  -d '{"title":"runtime card check","mode":"standard"}' \
  http://localhost:3000/api/consultation/sessions

curl -sS -H 'Content-Type: application/json' \
  -d '{"content":"@初始咨询 Agent 不应该先问我的实际情况什么的吗？"}' \
  http://localhost:3000/api/consultation/sessions/<sessionId>/messages
```

结果：

- `currentStage` 返回 `实际情况确认中`。
- assistant 回复承认“真正的咨询应该先问实际情况”。
- `update_strategy_snapshot` 为 skipped。
- `update_content_calendar`、`generate_article_brief`、`generate_video_brief` 均为 skipped。
- 未再出现“策略已经够落地了”或“策略沉淀完成”的伪完成状态。

追加验证：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-runtime/runtime.ts src/server/api/consultation-runtime/context.ts src/server/api/consultation-runtime/tools.ts src/server/api/consultation-service.test.ts
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime/runtime.ts app/src/server/api/consultation-runtime/context.ts app/src/server/api/consultation-runtime/tools.ts app/src/server/api/consultation-service.test.ts
```

结果：

- 23 条咨询 runtime 回归测试通过。
- TypeScript typecheck 通过。
- 针对本次修复文件的 ESLint 通过。
- diff whitespace 检查通过。

## 追加执行：同步 Production 环境变量并部署 Vercel Production

用户明确要求直接推送到正式环境的 Supabase + Vercel 后，执行 Production 环境同步和线上部署。

执行内容：

- 备份原本地环境文件：
  - `app/.env.local.backup-20260503-173338`
- 从 Vercel Production 拉取真实环境变量到本地：

```bash
cd app && vercel env pull .env.local --environment=production --yes
```

- 同步后本地 `.env.local`：
  - 移除旧 `LLM_API_KEY`
  - 使用 Production `SILICONFLOW_API_KEY`
  - 使用 Production `NEXT_PUBLIC_SUPABASE_URL`
  - 使用 Production `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - 使用 Production `SUPABASE_SERVICE_ROLE_KEY`
- `vercel env pull` 自动补充 `app/.gitignore`：
  - `.env*.local`

环境验证：

- SiliconFlow 最小 chat completion 调用返回 `200 OK`。
- Production Supabase 可读 `platform_settings.llm_runtime`。
- `llm_runtime`：
  - `providerLabel = SiliconFlow`
  - `baseUrl = https://api.siliconflow.cn/v1`
  - `primaryModel = Qwen/Qwen3-32B`
  - `fallbackModel = Qwen/Qwen3-14B`

部署前验证：

```bash
cd app && npm run build
```

结果：

- 本地 production build 通过。
- TypeScript 在 build 阶段通过。
- 49 个静态页面生成完成。

Production 部署：

```bash
cd app && vercel --prod --yes
```

结果：

- Inspect URL：`https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/BjoeDruzSSt1Sz4CQZ3gZ7qQmfw8`
- Deployment URL：`https://jingjing-content-platform-staging-kdo9ri60u.vercel.app`
- Production alias：`https://jingjing-content-platform-staging.vercel.app`
- Vercel 远端 build 通过。
- Production alias 已切到新部署。

线上访问验证：

```bash
curl -sS -o /tmp/jingjing_prod_root.html -w "%{http_code}\n" https://jingjing-content-platform-staging.vercel.app/
curl -sS -o /tmp/jingjing_prod_login.html -w "%{http_code}\n" https://jingjing-content-platform-staging.vercel.app/login
```

结果：

- `/` 返回 `200`
- `/login` 返回 `200`

注意：

- 本次使用 Vercel CLI 从当前本地工作区直接部署 Production。
- 当前代码尚未 git commit / push / merge。
- 当前本地 `.env.local` 已连接 Production Supabase，本地操作会写真实线上数据。

## 追加执行：Agent Console 新建 / 复制 / 保存 / 设为线上闭环

用户指出后台目前只有一个咨询 Agent，且管理员后台无法新增 Agent；同时要求：新建 Agent 如果设为上线，应出现在商家咨询页可 @ 的专家列表中。

定位结论：

- 后端 API 已有能力：
  - `POST /api/platform-admin/agents`
  - `PATCH /api/platform-admin/agents/[agentId]`
  - `POST /api/platform-admin/agents/[agentId]/copy`
  - `POST /api/platform-admin/agents/[agentId]/set-online`
- 商家端专家列表已按 `serviceStatus === "enabled"` 拉取所有 Agent。
- 缺口主要在后台 UI：
  - “复制 Agent / 设为线上 / 保存”是未绑定动作的按钮。
  - Agent 基础信息字段只读。
  - 没有“新建 Agent”入口。

修复内容：

- `AgentConfigAdminPage` 侧边栏新增“新建 Agent”入口。
- 接通“复制 Agent”按钮：
  - 调用 copy API。
  - 复制 prompt / skill binding / knowledge binding 后在本地状态中展示。
- 接通“保存”按钮：
  - 可编辑名称、状态、角色描述、后台描述。
  - 保存为 `enabled` 后，会出现在商家端咨询页 @ 专家列表。
- 接通“设为线上”按钮：
  - 如果当前 Agent 不是 `enabled`，会先保存为 `enabled`。
  - 再调用 `set-online` API，切换 `consultation_default` route binding。
  - 因为已保证 `enabled`，所以同时会进入商家端 @ 专家列表。
- 增加后台说明：
  - “已启用 Agent 会出现在商家端咨询页的 @ 专家列表；设为线上会成为默认咨询入口。”
- 新增回归测试：
  - `app/src/server/api/agent-console-admin.test.ts`

验证：

```bash
cd app && node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/components/platform-admin/agent-console-pages.tsx src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.ts
cd app && npm run build
```

结果：

- 25 条相关回归测试通过。
- TypeScript typecheck 通过。
- targeted ESLint 通过。
- 本地 production build 通过。

Production 部署：

```bash
cd app && vercel --prod --yes
```

结果：

- Inspect URL：`https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/3vrnDcnQtrYCB491U5uSumd4bSmD`
- Deployment URL：`https://jingjing-content-platform-staging-ob0i7d6qv.vercel.app`
- Production alias：`https://jingjing-content-platform-staging.vercel.app`
- Vercel 远端 build 通过。
- Production alias 已切到新部署。

线上访问验证：

- `https://jingjing-content-platform-staging.vercel.app/platform-admin-login` 返回 `200`
- `https://jingjing-content-platform-staging.vercel.app/platform-admin/agents` 未登录返回 `307`，符合进入管理员鉴权流程预期。
