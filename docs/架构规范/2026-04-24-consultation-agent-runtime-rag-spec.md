# 咨询 Agent Runtime / Prompt / RAG 现状与目标说明

日期：2026-04-24
范围：静境商家平台的「AI 咨询诊断」Agent、平台知识库、后台配置与参考项目对照。
性质：当前实现事实 + 下一版目标架构说明，不是宣传稿。若后台线上配置被管理员改过，以 `platform_settings` 中的运行时值为准。

## 1. 结论摘要

当前咨询 Agent 是一个受控网页业务 Agent，不是 Claude Code / Hermes 那种可以自由读写文件、跑终端、调用浏览器和外部 MCP 的通用 Agent。

但目标上，它应该逐步演进成一个“业务安全版 Agent Runtime”：有明确 system prompt、短期会话记忆、长期商家记忆、RAG 知识库、受控工具调用、运行中进度/心跳、可插话策略，以及按工具风险分层的 runtime sandbox。

它现在具备：

- 可配置 system prompt：后台 `platform_settings.consultation_agent.systemPrompt` 持久化，默认值在代码和 migration 里都有。
- 可配置内部 skills/tools：后台可以勾选启用 `read_merchant_profile`、`retrieve_knowledge_base` 等受控业务工具。
- RAG 知识库：支持文本类知识上传、切块、embedding 入库、pgvector 检索，并在 embedding 不可用或向量无结果时降级关键词匹配。
- Agent loop：固定顺序的 bounded tool loop，不让模型自由决定任意工具调用。
- 安全上下文：知识入库前会扫描 prompt injection 风险，咨询回复只注入已入库的受控片段。

它现在还不具备：

- 不支持动态加载 Codex/Hermes 风格的 `SKILL.md` 文件。
- 不支持一次性批量上传多个知识文件。
- 不支持 PDF / Word 的正文解析入库。
- 不支持真正的 hybrid fusion 检索，也不支持语音检索。
- 不支持 Claude Code / Hermes 的 shell、file patch、browser automation、MCP、delegate subagent 等通用工具直接暴露给商家网页 Agent。
- 尚未实现长期记忆，当前只有会话内消息、策略快照和知识库检索。
- 尚未实现运行中 heartbeat / interrupt / steer / wait 队列。
- 尚未形成独立的 Agent runtime sandbox；当前安全边界主要靠后端受控工具、数据库 scope、服务端环境变量和 API route。

## 2. System Prompt 从哪里来

### 2.1 默认 system prompt

默认值定义在两个地方：

- `app/src/lib/db/platform-admin-repository.ts`
- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`

默认内容是：

```text
你是静境商家平台里的 AI 商业顾问。目标是帮助本地生活商家快速沉淀定位、卖点、目标客群、关键场景、内容策略和一周内容日历，并把结论转成后续图文与视频创作输入。
```

### 2.2 线上运行时 system prompt

运行时不会把这个默认值写死。发送咨询消息时，后端会调用：

```ts
getPlatformSettings()
```

并读取：

```ts
consultationAgent.systemPrompt
```

所以实际生效优先级是：

1. Supabase `platform_settings` 表里的 `consultation_agent.value.systemPrompt`
2. 如果数据库没有该配置，使用代码里的默认 `defaultConsultationAgent.systemPrompt`

后台配置入口在平台管理页的 settings editor，配置项包括 system prompt、启用工具、max rounds、retrieval topK、模型、temperature 等。

### 2.3 发送给大模型的 system message

咨询回复调用 LLM 时，system message 由三段拼接：

1. 后台配置的 `consultationAgent.systemPrompt`
2. 约束模型只输出给商家的中文自然语言回复，不输出 JSON、Markdown 表格或内部工具名
3. 要求基于已完成工具结果、策略快照、受控知识库片段回答；信息不足时只提出一个关键追问

实现位置：

```text
app/src/server/api/consultation-service.ts
buildAssistantReplyWithModel()
```

## 3. 是否支持加载 Skill

这里要区分两个概念。

### 3.1 当前支持的是“内部业务工具开关”

当前 `ConsultationAgentToolKey` 只允许以下 7 个工具：

```ts
read_merchant_profile
retrieve_knowledge_base
update_strategy_snapshot
update_content_calendar
generate_article_brief
generate_video_brief
read_history
```

它们定义在：

```text
app/src/contracts/knowledge.ts
```

后台可以配置 `enabledTools`，本质是启用/禁用这些内部业务工具。UI 上可以叫 skills/tools，但实现上不是动态技能系统。

### 3.2 当前不支持动态加载 SKILL.md

当前网页咨询 Agent 不会扫描这些目录：

```text
.codex/skills/
references/open-source/hermes-agent/skills/
项目内任意 SKILL.md
```

也不会像 Hermes 一样通过 `skills_list`、`skill_view`、`skill_manage` 让模型读取技能文档。

如果后续要做真正的 skill，需要单独设计：

- skill 的存储表
- skill 的启停规则
- skill 的安全扫描
- skill 注入顺序
- skill 与商家/平台/行业的作用域
- skill 内容是否可被普通商户编辑

建议当前阶段先把“后台可配置内部工具”称为 `tools`，避免和 Codex/Hermes 的 `skills` 混淆。

## 4. RAG 知识库检索策略

### 4.1 当前策略：向量优先，关键词降级

当前检索不是融合式 hybrid search。准确说是：

1. 用当前咨询上下文拼出 query。
2. 如果 AI runtime API key 存在，则调用 embedding 模型生成 query embedding。
3. 如果 Supabase pgvector RPC 返回向量结果，则直接使用向量相似度结果。
4. 如果没有 embedding、向量 RPC 失败、或向量检索无结果，则降级为关键词打分。

实现位置：

```text
app/src/server/api/consultation-service.ts
embedKnowledgeQuery()
dispatchConsultationTool()

app/src/lib/db/knowledge-repository.ts
searchKnowledgeChunks()
```

向量检索 SQL：

```text
app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql
public.match_knowledge_chunks()
```

这个 SQL 使用 `pgvector`：

```sql
1 - (chunks.embedding <=> query_embedding) as score
```

索引是 HNSW cosine：

```sql
using hnsw (embedding vector_cosine_ops)
```

### 4.2 为什么不是 hybrid search

真正 hybrid search 一般会同时取向量结果和关键词/BM25结果，再做 rerank 或 reciprocal rank fusion。

当前实现不是这样。它是：

- 有可用向量结果：用向量结果
- 否则：退回关键词结果

所以更准确的命名是：

```text
vector search with lexical fallback
```

不是：

```text
hybrid search / BM25 + embedding fusion
```

### 4.3 是否支持语音检索

不支持。

当前知识库只处理文本内容。没有语音转写、音频 embedding、说话人识别，也没有音频检索索引。

### 4.4 query 是怎么构造的

知识库 query 来自这些字段拼接：

1. 当前用户输入
2. 商家行业
3. 商家服务项目
4. 上一轮策略快照里的 positioning
5. 上一轮策略标签
6. 上一轮目标客群

实现位置：

```text
app/src/server/api/consultation-service.ts
buildKnowledgeQuery()
```

当前 `knowledgeRuntime.queryRewriteEnabled` 已经存在于配置结构里，但检索代码还没有真正实现 query rewrite。也就是说，这个字段是预留项，不是当前生效能力。

## 5. 知识库上传能力

### 5.1 当前是否支持一次上传多个文件

不支持。

当前后台知识库上传 UI 只读：

```ts
event.target.files?.[0]
```

API 也只读取一个 FormData 字段：

```ts
formData.get("file")
```

所以现在是“一次一个文件或一段粘贴文本”。可以连续上传多次，但没有批量多文件队列。

实现位置：

```text
app/src/components/platform-admin/platform-knowledge-manager.tsx
app/src/app/api/platform-admin/knowledge/documents/route.ts
```

### 5.2 当前支持哪些文件格式

当前支持文本类文件：

```text
.txt
.md
.markdown
.csv
.json
.jsonl
.yaml
.yml
.xml
```

同时接受这些 MIME 类型特征：

```text
text/*
application/json
包含 markdown / csv / yaml / xml 的 MIME
```

实现判断在：

```text
app/src/server/api/knowledge-service.ts
isTextLikeKnowledgeFile()
```

### 5.3 当前不支持哪些格式

当前不解析：

- PDF
- Word / DOCX
- Excel
- 图片
- 音频
- 视频

UI 文案里已经写明：PDF/Word 后续交给异步 worker。当前后端实际会把非文本类文件拒绝为 unsupported。

### 5.4 文件大小限制

单个知识文档限制：

```text
10 MB
```

实现位置：

```text
app/src/server/api/knowledge-service.ts
maxKnowledgeDocumentBytes = 10 * 1024 * 1024
```

### 5.5 入库流程

当前入库流程是同步 demo 模式：

1. 校验 scope：`platform` 或 `merchant`
2. 读取上传文件或粘贴文本
3. 上传原文到 Tencent COS；如果 COS 未配置，会记录 skipped reason
4. 创建 `knowledge_documents`
5. 创建 `knowledge_ingestion_jobs`
6. 对文本做 prompt-injection / hidden text / secret exfiltration 风险扫描
7. 按 `knowledgeRuntime.chunkSize` 和 `chunkOverlap` 切块
8. 如果 API key 存在，调用 embedding 模型
9. 写入 `knowledge_chunks`
10. 更新文档状态为 `indexed` 或 `failed`

相关表：

```text
knowledge_documents
knowledge_chunks
knowledge_ingestion_jobs
```

## 6. 咨询 Agent 上下文调度

### 6.1 新建会话

新建咨询会话时：

1. 根据当前登录用户读取商家资料
2. 读取平台 consultation agent 配置
3. 创建初始 `strategySnapshot`
4. 创建 `consultation_sessions`
5. 记录 `session.created` 事件
6. 写入一条 assistant greeting message
7. greeting message 带初始 tool cards

新建会话不调用大模型。

实现位置：

```text
app/src/server/api/consultation-service.ts
createConsultationSessionForUser()
```

### 6.2 每次发送用户消息

每次商家发送消息时，顺序是：

1. 通过 owner user id 读取当前商家资料
2. 并行读取平台配置与当前会话详情
3. 先把用户消息写入 `consultation_messages`
4. 汇总当前会话里的所有 user messages
5. 计算 next round 和 next stage
6. 规划并执行受控工具
7. 根据工具结果更新 strategy snapshot
8. 组装 LLM prompt 并调用大模型
9. 如果没有 API key 或 LLM 调用失败，使用本地 fallback 文案
10. 写入 assistant message、tool cards、visible summary
11. 更新 session 的 current stage / summary / strategy snapshot
12. 写入 agent loop 事件

实现位置：

```text
app/src/server/api/consultation-service.ts
sendConsultationMessageForUser()
runConsultationAgentLoop()
```

### 6.3 工具执行顺序

工具不是由模型自由选择，而是后端固定排序后按 `enabledTools` 过滤：

```text
1. read_merchant_profile
2. retrieve_knowledge_base
3. read_history
4. update_strategy_snapshot
5. update_content_calendar
6. generate_article_brief
7. generate_video_brief
```

实现位置：

```text
app/src/server/api/consultation-service.ts
planConsultationToolCalls()
```

这个设计更像一个“可配置业务 workflow”，不是完全开放的 ReAct Agent。

### 6.4 最终塞给 LLM 的上下文顺序

当前真正发给 LLM 的 messages 只有两条：

第一条：system message

1. 后台 system prompt
2. 输出格式约束
3. 基于工具结果/策略快照/知识库片段回答的约束

第二条：user message，内容是 JSON 字符串，字段顺序如下：

1. `merchant`
   - name
   - industry
   - serviceItems
   - defaultCta
2. `userMessage`
3. `round`
4. `strategySnapshot`
5. `knowledgeMatches`
   - title
   - score
   - content，单片段截断到 600 字符
6. `toolResults`
   - tool
   - status
   - summary
7. `fallbackDraft`

实现位置：

```text
app/src/server/api/consultation-service.ts
buildAssistantReplyWithModel()
```

注意：完整历史消息不会逐条塞给 LLM；历史主要通过 `allUserMessages` 参与策略快照构造，以及通过 `read_history` 工具卡记录。当前没有长上下文压缩器，也没有总结记忆注入。

这个点是当前咨询 Agent 和目标 Agent Runtime 的主要差距之一。下一版应该把“短期会话记忆”和“长期商家记忆”作为一等能力，而不是只靠 `strategySnapshot` 兜底。

### 6.5 写回前端的可见状态

assistant message 会保存：

- content：给商家的自然语言回复
- toolCards：前端展示的执行过程卡片
- visibleSummary：定位、策略标签、知识库上下文、agent loop 引用、下一步动作

这些最终存在：

```text
consultation_messages.tool_cards
consultation_messages.visible_summary
```

### 6.6 目标版记忆分层

下一版上下文应明确分为三层记忆：

第一层：短期记忆，也就是当前会话记忆。

- 来源：`consultation_sessions`、`consultation_messages`、`consultation_events`、当前 `strategySnapshot`、当前轮工具结果。
- 内容：最近若干轮用户/assistant 对话、当前阶段、已识别业务目标、成交异议、内容方向、工具执行状态。
- 生命周期：跟随一个 consultation session；删除会话时可一起删除。
- 用途：保证一轮咨询内部持续推进，不重复问、不丢失刚刚确认的信息。

第二层：长期记忆，也就是商家/账号级稳定记忆。

- 来源：多轮咨询沉淀、商家设置、内容工作台结果、人工确认/否定、长期运营偏好。
- 内容：商家长期定位、品牌语气、禁用表达、常见成交异议、目标客群稳定画像、历史有效内容切口、老板偏好、已验证失败的方案。
- 生命周期：跨 session 存在，跟随 merchant 或 owner user；需要可编辑、可删除、可审计。
- 用途：下次新建对话时，Agent 不应该像第一次见这个商家一样从零开始。

第三层：外部知识，也就是 RAG 知识库。

- 来源：平台方法论、行业 SOP、内容模板、禁忌话术、商家上传资料。
- 内容：可复用知识片段，不等于这个商家的个人记忆。
- 生命周期：平台级或商家级文档；由知识库管理。
- 用途：给 Agent 方法论和事实依据。

建议新增的数据结构：

```text
merchant_memories
merchant_memory_embeddings
consultation_session_summaries
agent_runs
agent_run_events
agent_pending_inputs
```

长期记忆不要直接保存整段聊天原文。更合理的是保存结构化事实，例如：

```json
{
  "type": "merchant_preference",
  "scope": "merchant",
  "content": "商家更希望内容语气偏专业温柔，不要过度制造焦虑。",
  "sourceSessionId": "...",
  "confidence": 0.82,
  "status": "active"
}
```

### 6.7 目标版上下文注入顺序

目标版每次调用大模型时，建议采用稳定顺序，避免上下文互相污染：

```text
1. Platform/developer guardrails
2. 后台配置的 consultationAgent.systemPrompt
3. Runtime policy：可用工具、权限边界、沙箱限制、输出格式
4. 当前商家资料：merchant profile、服务项目、CTA、行业、门店信息
5. 长期记忆：merchant memories，必须用 memory-context fence 包起来
6. 短期记忆：当前 session summary、最近 N 轮消息、当前 strategySnapshot
7. RAG 知识片段：platform/merchant knowledge chunks，必须标注来源和分数
8. 当前轮工具结果：toolResults、toolCards、失败/跳过原因
9. 当前用户消息
10. 期望输出：自然语言回复 + 是否需要写入记忆/更新策略/生成任务
```

长期记忆建议参考 Hermes 的 memory context fencing 思路：记忆是背景，不是用户本轮输入。可以类似这样注入：

```text
<memory-context>
[System note: The following is recalled merchant memory context, NOT new user input.]
...
</memory-context>
```

这样可以降低模型把历史记忆误当作当前用户指令的风险。

### 6.8 长期记忆读写生命周期

目标版一轮咨询建议分三段处理记忆：

Pre-turn recall：

- 用当前用户输入 + 商家行业 + 当前 session summary + strategy tags 构造 memory query。
- 检索 merchant-level memories，最多注入 Top K。
- 同时可以检索“否定记忆”，例如商家明确不喜欢某类表达。

In-turn working memory：

- 工具调用结果、RAG 片段、策略快照都先进入短期 working state。
- 不要在工具执行中途频繁写长期记忆，避免把未确认推断写成事实。

Post-turn memory write：

- 在 assistant 回复生成后，单独跑一个 memory extraction 步骤。
- 只把稳定事实、偏好、约束、长期有效洞察写入长期记忆。
- 对置信度低的内容标记为 `candidate`，后台可人工确认。

可增加的受控工具：

```text
memory_search
memory_write_candidate
memory_confirm
memory_delete
session_summarize
```

这些工具都应该是业务工具，不是自由文件/数据库工具。

### 6.9 心跳、插话与等待机制目标

当前咨询接口是同步请求：用户发一条，后端跑完 tool loop 和 LLM，再返回完整 session。下一版如果模型调用、检索、工具执行变长，就需要运行态。

建议新增 `agent_runs`：

```text
id
session_id
merchant_id
status: queued | running | waiting_for_tool | waiting_for_user | completed | failed | interrupted | cancelled
interrupt_mode: guide | wait
heartbeat_at
started_at
finished_at
current_step
last_event_summary
```

建议新增 `agent_run_events`：

```text
run_id
event_type: heartbeat | tool_started | tool_completed | model_started | model_delta | interrupted | queued_input | completed
payload
created_at
```

两种插话模式：

Guide 模式：

- 用户在 Agent 运行中追加一句话。
- 系统不一定立刻硬停当前工具，但会把这句话作为 steering note 注入到下一个安全点。
- 如果正在等待 LLM，可以参考 Hermes 的 interrupt 思路：尝试中断当前 API call 或 stream，把新用户消息并入下一次模型调用。
- UI 文案可以提示：“我收到了你的补充，会在当前步骤结束后立刻纳入判断。”

Wait 模式：

- 用户追加消息后不干扰当前 run。
- 消息进入 `agent_pending_inputs`。
- 当前 run 完成后自动开启下一轮，或提示用户点击继续。
- UI 文案可以提示：“当前诊断还在生成，这条补充会排队到下一轮处理。”

心跳要求：

- 后端每 5-10 秒写一次 heartbeat，避免前端以为卡死。
- 长工具调用要写 `current_step`，例如“检索知识库”“生成回复”“更新策略快照”。
- 前端根据 `heartbeat_at` 判断运行是否 stale。
- 如果超过阈值未心跳，可提供“继续等待 / 取消 / 重新生成”。

这个设计可以参考 Hermes 的两类能力：

- `interrupt()`：新消息触发中断，传播到 agent、工具 worker、子 agent。
- `steer()`：不硬停当前工具，而是把用户补充注入下一次工具结果/下一轮上下文。

对于静境网页 Agent，优先做 Wait 模式更稳；Guide 模式可以作为第二阶段。

## 7. Runtime 如何定义

### 7.1 Next.js route runtime

咨询、知识库、后台设置相关 API route 使用：

```ts
export const runtime = "nodejs";
```

也就是说它们运行在 Node.js runtime，而不是 Edge runtime。

### 7.2 LLM runtime 配置

平台配置结构：

```ts
llmRuntime = {
  providerLabel,
  baseUrl,
  primaryModel,
  fallbackModel,
  temperature,
  maxTokens,
  timeoutSeconds,
  retryCount,
  apiKeyMasked,
  apiKeySource
}
```

定义位置：

```text
app/src/contracts/platform-admin.ts
app/src/lib/db/platform-admin-repository.ts
```

### 7.3 API key 从哪里来

AI runtime API key 只从服务端环境变量读取，不从前端读取：

```text
SILICONFLOW_API_KEY
LLM_API_KEY
OPENAI_API_KEY
```

优先级也是上面这个顺序。

实现位置：

```text
app/src/server/api/ai-runtime.ts
getAiRuntimeApiKey()
```

文档和前端都不应该展示真实 key。后台最多展示 masked 状态。

### 7.4 Chat completion 封装

当前封装是 OpenAI-compatible：

```text
POST {baseUrl}/chat/completions
```

payload 包括：

```json
{
  "model": "...",
  "messages": "...",
  "temperature": "...",
  "max_tokens": "...",
  "stream": false
}
```

注意：

- 咨询 Agent 调用时优先传 `consultationAgent.model`。
- 如果没有传 model，才使用 `llmRuntime.primaryModel`。
- 当前 `llmRuntime.fallbackModel` 配置存在，但 `ai-runtime.ts` 尚未实现自动切备用模型。
- 当前 `llmRuntime.retryCount` 配置存在，但 `ai-runtime.ts` 尚未实现重试循环。
- 当前 `consultationAgent.temperature` 配置存在，但 chat payload 使用的是 `llmRuntime.temperature`。

这些属于后续需要对齐的配置债务。

### 7.5 Embedding 封装

embedding 也是 OpenAI-compatible：

```text
POST {baseUrl}/embeddings
```

使用：

```text
knowledgeRuntime.embeddingModel
```

embedding dimensions 来自：

```text
EMBEDDING_DIMENSIONS
```

默认：

```text
1536
```

如果返回维度不等于配置维度，会直接报错，避免把错误维度写入 `vector(1536)` 列。

### 7.6 目标版 Runtime Sandbox

当前咨询 Agent 没有暴露 shell、文件写入、浏览器控制和任意 MCP，因此暂时不需要 Claude Code / Hermes 那种 OS 级沙箱。但一旦后续引入更强工具，必须分层做 sandbox。

建议分成四层。

第一层：LLM Runtime Sandbox。

- 大模型只接收经过调度器整理后的上下文，不直接读数据库、不直接读环境变量。
- API key 只在服务端 `ai-runtime.ts` 读取，不进入 prompt，不返回前端。
- system prompt、merchant profile、memory、RAG、tool results 分块注入，并标明来源和角色。
- 所有外部上下文都做 prompt-injection 扫描或 fence。

第二层：Business Tool Sandbox。

- 每个工具都有固定 schema、权限 scope、超时、审计日志。
- 工具只能通过 repository/service 函数访问业务数据，不能让模型拼 SQL。
- 每次工具调用都绑定 `merchantId`、`sessionId`、`runId`。
- 高风险动作必须有 approval gate，例如真实发布、外部消息发送、账号授权变更。
- 普通商家 Agent 默认只开放咨询、检索、策略、草稿生成类工具。

第三层：Storage / Network Sandbox。

- Supabase 侧继续依赖 RLS + service role 后端封装，前端不拿 service key。
- COS / 文件对象必须用 scope prefix，例如 `platform/`、`merchant/{merchantId}/`。
- 后续网页导入或 browser import 必须限制域名、协议、文件大小、重定向次数，防 SSRF。
- 任何上传内容入库前都要保留 context threat scan。

第四层：Execution Sandbox。

- 如果未来真的需要执行代码、浏览器自动化、复杂导入 worker，不要放在 Next.js API route 里执行。
- 应放到隔离 worker 或容器里，例如 Docker / Firecracker / Modal / 云函数隔离环境。
- 环境变量采用 allowlist，不继承全量服务端 env。
- 限制 CPU、内存、进程数、运行时长、磁盘、网络。
- 工作目录按 run 隔离，用完清理，必要时保留审计快照。

Hermes 的 Docker sandbox 值得参考：

- drop capabilities
- no-new-privileges
- pids-limit
- tmpfs 限制
- 环境变量 allowlist
- per-call process
- interrupt 检测

但静境商家 Agent 不应该直接照搬 terminal sandbox，因为我们的核心风险不是“让 AI 写代码”，而是“让 AI 在商家数据、账号授权、内容发布链路里越权”。所以更重要的是 business sandbox、approval、audit 和 tenant isolation。

### 7.7 Runtime 与工具调用的推荐边界

建议把 Runtime 拆成这些内部模块：

```text
AgentOrchestrator
ContextAssembler
MemoryRuntime
KnowledgeRuntime
ToolRegistry
ToolExecutor
SandboxPolicy
RunStateStore
HeartbeatEmitter
ApprovalGate
AuditLogger
```

其中：

- `AgentOrchestrator` 负责 run 生命周期，不直接访问业务表。
- `ContextAssembler` 负责按固定顺序组装 prompt。
- `MemoryRuntime` 负责长期/短期记忆检索与写入候选。
- `KnowledgeRuntime` 负责 RAG 检索、rerank、来源截断。
- `ToolRegistry` 只暴露白名单工具。
- `ToolExecutor` 执行工具并统一记录事件。
- `SandboxPolicy` 判断工具是否允许执行、是否需要 approval。
- `RunStateStore` 保存 run 状态与 pending input。
- `HeartbeatEmitter` 写 heartbeat / SSE / polling events。
- `ApprovalGate` 处理等待用户授权。
- `AuditLogger` 记录工具、权限、输入输出摘要。

## 8. 当前封装了哪些业务工具

### 8.1 read_merchant_profile

读取商家资料、行业、服务项目、品牌上下文。

适用：每轮咨询都适用。
风险：低。只读。

### 8.2 retrieve_knowledge_base

根据用户消息、商家资料和策略快照构造 query，检索平台/商户知识库。

适用：每轮咨询都适用。
风险：中。需要继续保持入库扫描和片段截断。

### 8.3 read_history

读取当前会话消息数量和 summary。

适用：当前只作为可见工具卡和轻量上下文入口。
风险：低。
限制：尚未做 Hermes 风格 session_search 或长历史压缩。

### 8.4 update_strategy_snapshot

把商家资料、所有用户消息、知识库片段合并成策略快照：

- positioning
- coreSellingPoints
- targetAudiences
- keyScenes
- currentSuggestion
- strategyTags
- contentCalendarDraft
- articleBrief
- videoBrief

适用：核心工具。
风险：中。当前主要是规则/关键词生成，不是独立 LLM 结构化抽取。

### 8.5 update_content_calendar

把策略快照里的 content calendar 暴露给前端和后续工作台。

适用：内容工作台衔接。
风险：低。

### 8.6 generate_article_brief

生成图文工作台可用的标题、角度、CTA 草案。

适用：图文工作台衔接。
风险：低到中。后续应写入正式草稿或任务表。

### 8.7 generate_video_brief

生成视频工作台可用的标题、钩子、输出目标。

适用：视频工作台衔接。
风险：低到中。后续应写入视频任务或脚本草稿表。

## 9. 和 hermes-agent 的对照

参考项目路径：

```text
references/open-source/hermes-agent
```

本轮确认到 Hermes 的核心设计包括：

- `model_tools.py`：统一发现工具、输出 OpenAI-format tool schema、分发 function call。
- `tools/registry.py`：工具注册表，每个工具自注册 schema、handler、toolset、可用性检查。
- `toolsets.py`：按 toolset 启用/禁用工具。
- `agent/prompt_builder.py`：组装 system prompt、skills、上下文文件，并扫描 prompt injection。
- `agent/context_compressor.py`：压缩历史上下文和大型工具结果。

Hermes 里可见工具大类包括：

- Web：`web_search`、`web_extract`
- Browser：`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_scroll`、`browser_back`、`browser_press`、`browser_get_images`、`browser_vision`、`browser_console`、`browser_cdp`
- File：`read_file`、`write_file`、`patch`、`search_files`
- Terminal / process：`terminal`、`process`
- Skills：`skills_list`、`skill_view`、`skill_manage`
- Memory / history：`memory`、`session_search`
- Planning：`todo`、`clarify`
- Delegation / code：`delegate_task`、`execute_code`
- Media：`vision_analyze`、`image_generate`、`text_to_speech`
- Messaging / platform：`send_message`、`discord_server`、Feishu docs/drive tools
- Automation：`cronjob`
- MCP：动态注册外部 MCP tools
- Home Assistant：`ha_list_entities`、`ha_get_state`、`ha_list_services`、`ha_call_service`
- RL：`rl_*` 训练相关工具
- Advanced reasoning：`mixture_of_agents`

当前静境咨询 Agent 借鉴了 Hermes 的这些思想：

- 受控工具注册/枚举，而不是任意执行。
- 工具结果以可见摘要返回给用户。
- 知识上下文入库前做 prompt-injection 扫描。
- RAG 片段作为受控上下文注入。
- 工具执行结果写入事件，便于审计。
- 长期记忆可以参考 `MemoryManager` 的 prefetch / sync / fenced context 模式。
- 上下文压缩可以参考 `ContextEngine` / `ContextCompressor` 的 pluggable context engine。
- 运行中插话可以参考 `interrupt()` 和 `steer()` 的区分：一个偏中断，一个偏引导。
- 沙箱可以参考 `tools/environments/docker.py` 和 `tools/path_security.py`，但要改造成业务权限沙箱，而不是直接给网页 Agent 开 terminal。

当前没有照搬 Hermes 的这些能力：

- 动态 tool registry。
- `skills_list / skill_view / skill_manage`。
- terminal / process / code execution。
- file read/write/patch。
- browser automation。
- MCP 动态工具。
- delegate subagent。
- context compressor。
- persistent memory provider。
- interrupt / steer / queued pending input。
- Docker / Modal / Daytona 等执行环境。

对于商家网页 Agent，不建议直接暴露 Hermes 的通用工具。更适合选择性吸收：

- 适合吸收：tool registry 思想、toolset 配置、skills 文档管理、session_search、context compressor、safe context scanner。
- 谨慎吸收：browser automation、send_message、cronjob、MCP，需要强权限与审计。
- 不适合直接暴露：terminal、file write、patch、execute_code、Home Assistant、RL、任意外部 MCP。

## 10. 和 Claude Code 参考目录的对照

参考路径：

```text
references/open-source/claude-code泄漏的客户端源码/claude-code-main
```

本轮两次检查该路径时，文件系统视图仍只有目录结构和 `.DS_Store` 等少量文件，目录体积约 48K；`src`、`docs/tools`、`src/bootstrap/src/tools` 下没有可读 `.ts/.tsx/.js/.md/.json` 源码文件。因此本文件暂不对 Claude Code 的具体源码实现和工具 schema 做伪造结论。

如果完整客户端源码已经下载到另一个路径，或 iCloud 后续把文件补齐，需要追加一份 Claude Code code reading 补充文档，重点看：

- tool 定义和 tool permission 如何绑定。
- sandbox toggle / permissions / approval 的状态机。
- MCP 和 plugin 如何被注册、启停、隔离。
- session / memory / context 如何写入和压缩。
- 运行中 interrupt / cancel / continue 如何处理。
- 客户端如何向用户展示工具执行过程和风险提示。

从目录名可以看到它至少按这些方向组织能力：

- commands：`config`、`context`、`diff`、`doctor`、`files`、`hooks`、`ide`、`mcp`、`memory`、`model`、`permissions`、`plan`、`plugin`、`review`、`sandbox-toggle`、`session`、`skills`、`terminalSetup`、`voice`、`workflows` 等
- bootstrap tools：存在 `AgentTool` 目录，但当前没有可读文件
- packages：存在 computer-use、chrome-mcp、audio-capture、image-processor 等包目录，但当前没有可读源码

当前静境咨询 Agent 借鉴的更像是 Claude Code 的产品化体验方向，而不是具体工具实现：

- 工具执行过程要可见。
- 关键动作要有权限边界。
- 历史记录要作为当前 Agent 的上下文资产，而不是混进“我的内容”。
- 后台配置要能控制 prompt / tools / runtime。
- 长上下文和工具结果需要压缩或折叠，而不是铺满 UI。
- 高风险能力必须有 permission / sandbox / approval，而不是只靠 prompt 约束。
- 运行中的用户补充应该进入 interrupt / guide / wait 机制，而不是被前端禁用输入或吞掉。

如果后续要做严格的 Claude Code 源码对照，需要先把该参考目录完整下载到本地，再补一份单独的 code reading doc。

## 11. 哪些参考工具适合网页咨询 Agent

### 11.1 适合近期加入

- `session_search` 类能力：把历史咨询记录做可检索摘要，替代现在的轻量 `read_history`。
- `skills_list / skill_view` 的产品化变体：后台维护“咨询方法论 skill”，但只允许受控注入，不让模型读取任意本地文件。
- `memory_search / memory_write_candidate` 类能力：把长期商家记忆做成受控工具，不能让模型直接写库。
- `context_compressor` 类能力：当咨询轮次变长，把旧消息压缩成结构化摘要。
- `clarify` 类能力：模型信息不足时返回一个关键追问，并在 UI 上展示为建议问题。
- `todo` 类能力：把咨询结论转成可执行任务清单，例如“完善商家资料、生成图文、生成视频、导入素材”。
- `run_state / heartbeat` 类能力：让前端知道 Agent 正在做什么，允许排队或插话。

### 11.2 可做但必须加权限

- Browser import：如果未来要自动读取公开平台页面，可做成只读导入工具，限定域名、账号、速率、审计日志。
- Messaging：如果未来要发企微/飞书/短信提醒，只能由后台绑定 channel，不允许模型自由填收件人。
- Cronjob：可以用于定期重新索引知识库或生成周计划，但不适合让商家对话直接创建任意定时任务。
- MCP：只适合后台白名单 MCP，不能开放给普通商户自接。
- Container sandbox：只适合 worker 或后台运维工具，不适合直接由普通商家对话触发任意命令。

### 11.3 不适合网页咨询 Agent

- `terminal`
- `process`
- `read_file`
- `write_file`
- `patch`
- `execute_code`
- 任意本地浏览器控制
- 任意外部 MCP tool
- 系统级 Home Assistant / OS / shell 能力

原因很简单：商家网页 Agent 的任务是咨询、诊断、内容策略和工作台联动，不是本机自动化或代码执行。把通用 Agent 工具暴露进去，安全风险远大于收益。

## 12. 当前需要补齐的技术债

1. 把 `consultationAgent.temperature` 和 `llmRuntime.temperature` 的职责重新定义，避免后台两个 temperature 让人误解。
2. 实现或移除 `llmRuntime.fallbackModel` 与 `retryCount`，否则配置存在但不生效。
3. 明确 `queryRewriteEnabled`：要么实现 query rewrite，要么在 UI 标注“预留”。
4. 给知识库增加批量多文件上传队列。
5. 给 PDF / DOCX 增加异步解析 worker。
6. 给咨询历史增加可检索 summary，替代现在只读当前 session message count。
7. 引入真正的 context compressor，避免长会话只靠策略快照。
8. 把“内部工具”与“动态 skill”在 UI 文案上分开。
9. 增加长期记忆表、embedding、候选写入、人工确认/删除能力。
10. 增加 `agent_runs` / `agent_run_events` / `agent_pending_inputs`，支持 heartbeat、wait、guide。
11. 建立 Agent runtime sandbox policy，把业务工具、存储、网络、执行环境分层隔离。
12. 对高风险工具建立 approval gate，例如真实发布、外部消息、账号授权变更。
13. 如果要继续参考 Claude Code，需要确认完整客户端源码所在路径或等待 iCloud 把该目录源码文件真正拉到本地。

## 13. 关键源码索引

- `app/src/contracts/knowledge.ts`：consultation tool key、agent settings、knowledge runtime 类型。
- `app/src/contracts/platform-admin.ts`：LLM runtime 与平台 settings 类型。
- `app/src/lib/db/platform-admin-repository.ts`：默认 system prompt、默认工具、settings 读写。
- `app/src/server/api/consultation-service.ts`：咨询 Agent loop、工具调度、LLM prompt 组装。
- `app/src/lib/db/consultation-repository.ts`：咨询 session / message / event 持久化。
- `app/src/server/api/ai-runtime.ts`：OpenAI-compatible chat / embeddings 封装。
- `app/src/server/api/knowledge-service.ts`：知识上传、扫描、切块、embedding 入库。
- `app/src/lib/db/knowledge-repository.ts`：知识文档、chunks、向量/关键词检索。
- `app/src/components/platform-admin/platform-settings-editor.tsx`：后台 runtime / prompt / tools 配置 UI。
- `app/src/components/platform-admin/platform-knowledge-manager.tsx`：后台知识上传 UI。
- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`：咨询与知识库基础表。
- `app/supabase/migrations/202604240002_v01_ai_runtime_vector_search.sql`：pgvector HNSW 与 match RPC。
- `references/open-source/hermes-agent/model_tools.py`：Hermes 工具 schema 与 dispatch 入口。
- `references/open-source/hermes-agent/tools/registry.py`：Hermes 工具注册表。
- `references/open-source/hermes-agent/toolsets.py`：Hermes toolset 定义。
- `references/open-source/hermes-agent/agent/prompt_builder.py`：Hermes prompt / skills / safe context。
- `references/open-source/hermes-agent/agent/context_compressor.py`：Hermes 上下文压缩。
- `references/open-source/hermes-agent/agent/memory_manager.py`：Hermes 长期记忆 provider、prefetch、sync、memory context fence。
- `references/open-source/hermes-agent/agent/context_engine.py`：Hermes pluggable context engine。
- `references/open-source/hermes-agent/run_agent.py`：Hermes interrupt / steer / tool loop / streaming run 参考。
- `references/open-source/hermes-agent/gateway/platforms/base.py`：Hermes active session、pending input、interrupt queue 参考。
- `references/open-source/hermes-agent/tools/environments/docker.py`：Hermes Docker execution sandbox 参考。
- `references/open-source/hermes-agent/tools/path_security.py`：Hermes path traversal guard 参考。
