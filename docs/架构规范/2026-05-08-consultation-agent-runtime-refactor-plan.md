# 2026-05-08 咨询 Agent Runtime Claude Code 思想借鉴改造方案

## 1. 背景

本轮目标不是搬运 Claude Code 代码，而是借鉴它的 agentic runtime 思想，继续改造当前咨询 Agent：

- 工具调用以真实结构化结果为事实源。
- prompt 负责价值观、角色和使用时机，不负责硬契约。
- runtime 负责必要工具、状态转移、失败结构化和可回放快照。
- UI 只展示真实执行事实，不展示为了好看的虚拟步骤。

本方案接续 `6597399 fix: require knowledge retrieval for consultation reads`，不得回退明确读取用户知识库时先执行 `retrieve_knowledge_base` 的修复。

## 2. 当前差距审计

### 2.1 已经接近 Claude Code 风格的能力

- `native_tool_calling_loop_v1` 已经扫描真实 `toolCalls`，没有依赖不可靠的 stop reason。
- 明确读取用户知识库或上传文件时，runtime 会先合成并执行真实 `retrieve_knowledge_base` 工具调用。
- `ai-runtime.ts` 的消息裁剪会保留 assistant tool call 与 tool result 配对。
- `buildToolCards` 已改为只展示真实 `toolResults`，不再渲染未执行工具的虚拟卡片。
- `agent_runtime_snapshots` 已记录 agent/soul/skill/knowledge/tool trace，具备可回放基础。

### 2.2 仍然不足的能力

- native loop 的工具解析失败此前只作为 `role: "tool"` 消息塞回模型，没有进入 `toolResults`、工具卡、loop completed payload 和 snapshot；用户侧看不到这类失败事实。
- 工具卡状态只有 `completed/skipped`，无法表达“模型请求工具但被 runtime 拒绝”或“工具执行失败”。
- 上下文预算目前只有 `char_budget_v1` 报告，没有类似 `compact_boundary` 的摘要边界事件，后续多轮长咨询容易难以解释“哪些内容被压缩”。
- “需要用户补充信息”仍主要靠正文追问，尚未工具化为可持久化的结构化结果。
- UI 的运行过程仍是最后一条 assistant message 的静态卡片，不是完整 run 心跳、取消、中断和恢复模型。

## 3. 分层原则

### 3.1 必须放 runtime

- 必要工具契约：例如明确读取知识库时先执行 `retrieve_knowledge_base`。
- 工具调用和工具结果一一对应，包括参数非法、未启用工具、未知工具和执行异常。
- 失败结构化：失败也必须成为可存储、可展示、可回放的事实。
- 状态门禁：只有工具真实 `completed` 且资产写入成功，才能把阶段或依赖视为完成。
- 上下文边界：后续新增 summary/compact boundary 时，由 runtime 记录，不靠模型自行解释。

### 3.2 应该放 prompt / soul / tool prompt

- 专家人格、互动节奏、提问方式。
- 工具使用时机、输入约束、失败时应如何回应用户。
- 对资料不足的表达策略：承认不足并追问关键事实。
- 禁止业务默认话术：不在通用代码里硬塞行业、客群、场景、卖点、私信转化或到店咨询内容。

### 3.3 应该放 UI

- 展示真实 tool results 的状态、摘要和错误。
- 展示 run 心跳、队列中、执行中、完成、失败等事件事实。
- 不从卡片数量或固定文案推断“已完成业务动作”。

## 4. 分阶段改造计划

### Phase 1：工具失败事实化

目标：一轮提交内完成，风险低。

- 扩展工具卡状态为 `completed / skipped / failed`。
- native tool calling 中，未知工具、未启用工具、非法 JSON、Schema 校验失败都写入 `toolResults`。
- `agent.loop.completed` 和 runtime snapshot 增加 `failedTools`。
- UI 展示失败状态，但不添加任何业务默认结论。
- 测试守住：
  - 明确读取知识库仍必须先执行 `retrieve_knowledge_base`。
  - native 工具拒绝必须成为 `failed` tool fact。

### Phase 2：工具执行外层安全壳

目标：让所有工具执行异常都转成结构化 result。

- 给 `dispatchTool` 外围增加统一 try/catch，不让工具异常绕过 loop。
- 区分 `validation_failed`、`runtime_error`、`provider_error`、`guardrail_rejected`。
- 失败 result 进入 tool cards、events、snapshot、assistant final context。
- 对 `search_benchmark_materials`、RAG embedding 失败等已有局部兜底做归一化。

### Phase 3：上下文边界与可回放快照

目标：让长咨询能解释上下文来源和压缩边界。

- 在 `buildContextBudgetReport` 之外新增 `context.compact_boundary` 或等价 snapshot 字段。
- 记录本轮使用了哪些 session summary、recent messages、knowledge chunks、strategy asset version。
- 当摘要替代旧消息时，在 snapshot 中保存边界说明和被摘要消息范围。

### Phase 4：用户补充问题工具化

目标：资料不足时形成结构化“需要补充”结果，而不是正文里散问。

- 新增轻量工具或结果类型，例如 `request_user_clarification`。
- 一轮只问一个关键问题。
- 资料不足时不得写策略资产，不得造行业。
- UI 可把追问和未满足前置条件展示为事实状态。

### Phase 5：Agent run 心跳与中断恢复

目标：从“最后一条消息附带卡片”升级到可观察运行中心。

- 引入 run id、step id、queued/running/completed/failed/cancelled 状态。
- 支持用户插话、中断或补充信息后的孤儿结果处理。
- 后续再考虑流式输出、工具进度和恢复策略。

## 5. 本轮落地范围

本轮只落 Phase 1：工具失败事实化。

不做：

- 不新增业务话术、行业样例、默认客群或默认场景。
- 不改知识库读取契约。
- 不改 strategy asset editor 的业务语义。
- 不改 worker、图文工作台或视频工作台链路。
