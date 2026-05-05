# 咨询专家资产三件套与上下文拼装规划

状态：规划中，未实现

日期：2026-05-05

## 1. 背景

当前咨询页已经从旧圆桌模式收口为：

```text
同一个 Consultation Runtime
+ 同一份共享咨询上下文
+ 用户通过 @ 选择本轮专家容器
```

本轮规划要解决的问题不是重新做多 Agent swarm，而是让每个可被 `@` 的专家更像一个独立专家：有明确职责、稳定表达风格、以及对商家长期协作经验的沉淀。

确认边界：

- 需要 `agent.md`、`soul.md`、`memory.md`。
- 暂不新增 `knowledge.md`，专家知识继续走现有 Knowledge Set 绑定。
- 暂不新增 `tools.md`，工具权限和可用工具继续由代码/配置控制。
- 暂不做“什么时候建议切到别的专家”。
- 短期记忆由 consultation runtime 控制。
- 长期记忆由专家维度的 `memory.md`/memory records 控制。

## 2. OpenClaw 参考结论

OpenClaw 不是把几个 Markdown 文件随手拼到用户消息后面，而是先构造一套 OpenClaw-owned system prompt，然后把用户可编辑文件注入到 `# Project Context`。

OpenClaw 代码中的 Project Context 文件排序为：

```text
AGENTS.md     10
SOUL.md       20
IDENTITY.md   30
USER.md       40
TOOLS.md      50
BOOTSTRAP.md  60
MEMORY.md     70
```

对我们有用的三件套顺序是：

```text
agent.md
-> soul.md
-> memory.md
```

这个顺序有明确含义：

- `agent.md` 先定义职责、行为边界、判断框架和输出规范。
- `soul.md` 再定义人格、语气、互动风格和 acknowledgement。
- `memory.md` 最后作为长期背景，不应覆盖职责和规则。

OpenClaw 还会在发现 `SOUL.md` 时额外提示模型：如果存在 `SOUL.md`，要 embody 它的人格和语气，但不能覆盖更高优先级指令。这一点适合直接借鉴。

## 3. OpenClaw 的 MEMORY.md 是怎么来的

OpenClaw 的 memory 分两层：

```text
MEMORY.md
memory/YYYY-MM-DD.md
```

### 3.1 MEMORY.md

`MEMORY.md` 是根级长期记忆文件，定位是 durable facts、preferences、decisions。它在适用 session 中会作为 Project Context 的一部分被注入，但 OpenClaw 也存在 channel/session gate；例如群聊场景可能不自动加载长期记忆，而是让 agent 通过 `memory_search` / `memory_get` 按需读取。文档明确提醒它要保持简短，否则会持续吃上下文。

它不是普通对话每轮都自动改写出来的。

OpenClaw 里 `MEMORY.md` 的主要形成路径有三类：

1. 人或 agent 显式编辑/写入。
2. legacy `memory.md` 迁移到 canonical `MEMORY.md`。
3. memory-core 的 dreaming deep phase 把短期高质量候选晋升到 `MEMORY.md`。

### 3.2 memory/YYYY-MM-DD.md

`memory/YYYY-MM-DD.md` 是日记/短期沉淀文件，记录运行中的上下文和观察。普通 turns 不默认把这些日记文件全塞进 Project Context，而是通过 `memory_search` / `memory_get` 按需读取。

OpenClaw 的 pre-compaction memory flush 主要写这里，而不是直接写 `MEMORY.md`。

关键点：

- flush 发生在上下文压缩前。
- flush 是一个 silent agentic turn。
- 默认 prompt 要求把 durable memories 写到 `memory/YYYY-MM-DD.md`。
- flush 明确要求把 `MEMORY.md`、`DREAMS.md`、`SOUL.md`、`TOOLS.md`、`AGENTS.md` 视为只读。
- flush 写文件时被限制为 append-only，且只能写当天 canonical 日记文件。

所以：OpenClaw 的普通自动总结更像“先写日记”，不是直接改长期总记忆。

### 3.3 Dreaming deep phase

OpenClaw 的 `memory-core` 还有一个 opt-in 的 background consolidation，叫 dreaming，默认关闭。

dreaming sweep 顺序是：

```text
light -> REM -> deep
```

其中：

- light：整理近期短期材料，不写 `MEMORY.md`。
- REM：提炼主题和反思，不写 `MEMORY.md`。
- deep：给候选打分并晋升，写 `MEMORY.md`。

deep phase 的晋升有门槛：

- 分数达到阈值。
- recall count 达标。
- unique queries 达标。
- 候选仍能从源文件中 rehydrate。
- 已晋升或疑似污染的 dreaming 片段会跳过。

最终写入 `MEMORY.md` 时，会追加类似：

```md
## Promoted From Short-Term Memory (YYYY-MM-DD)

<!-- openclaw-memory-promotion:<candidate-key> -->
- <snippet> [score=... recalls=... avg=... source=memory/YYYY-MM-DD.md:1-3]
```

因此，OpenClaw 的长期记忆不是单纯“agent 定期自己总结一下就覆盖 MEMORY.md”，而是：

```text
对话/检索/日记
-> short-term recall store
-> light/REM 增强信号
-> deep phase 打分
-> append 到 MEMORY.md
```

## 4. 我们的专家资产定义

### 4.1 agent.md

定位：专家系统指令。

内容建议：

- 专家职责。
- 不负责什么。
- 判断框架。
- 提问方式。
- 输出结构。
- 禁止行为。
- 与 consultation runtime 的边界。

当前系统映射：

- 复用现有 `agent_prompt_versions.body`。
- 后台 UI 把 `System Prompt` 改名/呈现为 `agent.md`。
- 继续沿用 draft / active / history 版本机制。

### 4.2 soul.md

定位：专家人格和表达风格。

内容建议：

- 专家说话方式。
- 亲和度、锋利度、耐心程度。
- acknowledgement 方式。
- 默认追问节奏。
- 用户压力较大时的回应方式。
- 哪些语气禁止使用。

约束：

- `soul.md` 不得覆盖 `agent.md` 的职责边界。
- `soul.md` 不得覆盖平台硬规则、账号安全、真实发布规则。
- `soul.md` 负责“像谁”，不负责“能做什么”。

建议新增：

```text
agent_soul_versions
- id
- agent_id
- version_no
- body
- status: draft / active / archived
- change_note
- created_by_admin_id
- created_at
- activated_at
- archived_at
```

### 4.3 memory.md

定位：该专家对当前商家/用户的长期协作经验。

内容示例：

```md
# memory.md

## 对这个商家的长期理解
- 这个商家更接受“真实案例 + 本地信任”的表达，不喜欢太营销化的话术。
- 他们已有客户故事素材，但经常缺少结果证明和前后对比。

## 这个专家的协作经验
- 资产素材顾问提问时，应先问“服务过程里发生了什么”，再问“有没有可证明的结果”。
- 内容转化顾问生成标题时，避免焦虑型标题，优先用轻 CTA。
```

约束：

- `memory.md` 不是知识库，不存通用行业资料。
- `memory.md` 不是完整聊天记录，不存流水账。
- `memory.md` 不是用户本轮输入，只是背景参考。
- `memory.md` 必须可删除、可纠错、可追溯来源。

建议底层不要直接做一个大 textarea，而是用 memory records 渲染成 `memory.md`。

建议新增：

```text
agent_memory_notes
- id
- agent_id
- merchant_id
- scope: merchant_agent / agent_global
- memory_type: fact / preference / strategy_pattern / interaction_note / episode_summary
- content_md
- tags
- source_session_id
- source_message_id
- confidence
- status: candidate / approved / rejected / archived
- created_by: runtime / admin / user
- created_at
- updated_at
```

长期记忆阶段只读取 `approved` 记忆；短期专家交通 V1 不依赖长期记忆落地。

## 5. 我们的上下文拼装顺序

参考 OpenClaw 后，建议咨询专家 runtime 使用以下顺序：

```text
平台硬规则
-> 咨询 Runtime 边界
-> agent.md
-> soul.md
-> memory.md（长期记忆阶段启用）
-> 动态咨询上下文
-> 用户本轮输入
```

更展开一点：

```text
【平台硬规则】
- 安全、账号、发布边界、工具权限、积分/权益边界。

【咨询 Runtime 边界】
- @ 只切换本轮专家，不切换会话。
- sessionContext 是共享事实层。
- 商家资料、策略资产、历史摘要由 runtime 控制。

【专家资产 Project Context】
## agent.md
专家职责、工作边界、判断方法、输出格式。

## soul.md
专家人格、语气、acknowledgement、互动节奏。
如果 soul.md 存在，遵循其表达风格；但不得覆盖 agent.md 和平台硬规则。

## memory.md（长期记忆阶段启用）
该专家对当前商家的长期经验。
这是背景参考，不代表用户本轮新输入。

【动态上下文】
- 当前用户消息。
- session summary。
- strategy snapshot。
- knowledge matches。
- tool observations。
- active skill bodies。
```

建议 `memory.md` 用 fence 包住：

```md
<memory-context>
以下是该专家对当前商家的长期记忆，只作为背景参考，不代表用户本轮新输入。
- ...
</memory-context>
```

## 6. 与现有系统的映射

当前已有：

- `agent_configs`
- `agent_prompt_versions`
- `agent_skills`
- `agent_skill_bindings`
- `knowledge_sets`
- `agent_knowledge_set_bindings`
- `agent_runtime_snapshots`
- 商家端 `@ 专家` 列表和专家容器解析。

建议改造：

1. `agent_prompt_versions.body` 继续作为 `agent.md`。
2. 新增 `agent_soul_versions`，作为 `soul.md`。
3. 新增 `agent_memory_notes`，渲染成 `memory.md`。
4. `knowledge_sets` 和 `agent_knowledge_set_bindings` 保持不变。
5. tools 继续由 `model_config.enabledTools` 和 runtime tool catalog 控制。
6. `agent_runtime_snapshots` 后续补充记录：
   - `soul_version_id`
   - `memory_match_ids`
   - 或在 snapshot metadata 里记录本轮注入的 memory note ids。

## 7. 阶段优先级调整

长期记忆的实现难度不是最高的。OpenClaw 已经验证了“短期信号 -> 打分 -> 过门槛 -> 晋升长期记忆”的方向，源码也能参考。

但本项目第一优先级不应是马上做长期记忆自动晋升，而是先把 2-3 个专家在同一个咨询 runtime 中的短期交通规则跑顺。

原因：

- 长期记忆写错后会持续污染专家判断，必须先有可审阅、可撤回、可追溯机制。
- 当前咨询页最先影响用户体感的是：专家之间是否知道彼此刚刚做了什么。
- 如果短期 runtime 交通不清楚，长期记忆会把混乱沉淀下来。
- OpenClaw 的 dreaming 是围绕文件系统 workspace、memory tools、cron 和 recall store 设计的；我们要迁移到 `agent_id + merchant_id + consultation_session_id` 的数据库模型，不能直接照搬。

因此建议阶段顺序调整为：

```text
V1：短期专家交通和共享上下文
V2：人工 approved 的专家 memory.md
V3：memory candidates
V4：借鉴 OpenClaw dreaming 的长期记忆晋升
```

## 8. V1：短期专家交通

V1 要先解决的问题：

```text
同一个 session 中
用户 @ 专家 A
-> 专家 A 追问/判断/产出
-> 用户再 @ 专家 B
-> 专家 B 能看见 A 的有效工作，而不是从零开始
```

这里不建议做专家之间自由聊天，也不建议让专家互相后台对话。更稳的是做“共享白板 + 专家回执”。

### 8.1 Shared Consultation State

runtime 维护一份会话级短期状态：

```text
shared_consultation_state
- merchant_profile_summary
- current_goal
- known_facts
- open_questions
- strategy_snapshot_summary
- expert_turn_notes
- unresolved_conflicts
- latest_user_intent
```

它不是长期记忆，只在当前 session / 当前 run 范围内有效。

### 8.2 Expert Turn Note

每次专家回复后，runtime 同步生成一个短期专家回执：

```text
expert_turn_note
- agent_id
- agent_key
- display_name
- turn_id
- what_i_understood
- what_i_changed
- open_questions_for_user
- handoff_for_next_expert
- confidence
```

这份 note 不直接展示给商家，但下一位专家会读到。

### 8.3 Context 拼装时的专家交通层

当用户 `@` 下一个专家时，runtime 注入：

```text
【本会话共享状态】
- 当前目标
- 已确认事实
- 未解决问题

【最近专家回执】
- 上一位专家做了什么
- 有哪些结论
- 有哪些问题要继续问
- 哪些地方存在不确定性
```

这样专家 B 不是读取完整 transcript，而是读取被 runtime 整理过的短期交通层。

### 8.4 V1 不做项

V1 暂不做：

- 专家自动互相召唤。
- 专家后台自由对话。
- 多专家并发回答。
- 自动长期记忆写入。
- memory candidates 自动审批。
- 专家之间的私有隐藏上下文。

专家之间的“沟通”只通过 shared state 和 expert turn note 完成。

## 9. V2/V3/V4：长期记忆路线

V2 开始再引入长期记忆。

V2：

- 后台人工维护 approved `memory.md`。
- runtime 按 `agent_id + merchant_id` 注入少量记忆。

V3：

- 咨询结束或阶段结束后生成 memory candidates。
- 只提取稳定事实、明确偏好、重复出现的协作模式。
- 候选带 source session/message 和 confidence。
- 人工批准后进入 `approved`。

V4：

- 借鉴 OpenClaw dreaming。
- 用多次 recall / 多轮验证 / 多会话重复出现作为晋升信号。
- 达标后自动生成候选，而不是直接写长期记忆。

## 10. 原专家资产实施建议

专家资产仍按三件套设计，但实施优先级要服从上面的短期交通优先策略。

### 10.1 后台 Agent Console

将专家配置页调整为：

```text
基础信息 | agent.md | soul.md | memory.md | 知识集 | 技能 | 测试台 | 运行快照
```

V1 功能：

- `agent.md`：复用现有 System Prompt 草稿/发布/历史。
- `soul.md`：支持草稿/发布/历史。
- `memory.md`：可先只做占位或人工维护，不作为第一阶段阻塞项。
- Knowledge：沿用现有挂载。
- Skills：沿用现有挂载。

### 10.2 咨询 runtime

本轮专家 resolved 后：

1. 读取 active `agent.md`。
2. 读取 active `soul.md`。
3. 注入 shared consultation state。
4. 注入最近 expert turn notes。
5. 如已启用长期记忆，再按 `agent_id + merchant_id + 当前用户问题` 检索 approved memory notes。
6. 按新的顺序组装 prompt/context。

## 11. 不做项

本版本不做：

- 自动建议切专家。
- 多专家自由聊天或 swarm。
- `knowledge.md`。
- `tools.md`。
- 第一阶段让模型直接永久写 approved memory。
- 把完整 transcript 当长期记忆注入。
- 把商家知识库内容复制进专家 memory。

## 12. 验收标准

第一阶段可按以下标准验收：

1. 商家端 `@ 专家` 列表不变。
2. 每个专家有可编辑、可发布、可回滚的 `agent.md`。
3. 每个专家有可编辑、可发布、可回滚的 `soul.md`。
4. 咨询 runtime 注入 `agent.md + soul.md + shared consultation state + expert turn notes`。
5. 切换 `@ 专家` 不清空共享会话上下文。
6. 专家 B 能读取专家 A 的关键结论、未解决问题和 handoff。
7. 专家之间不自由后台聊天，不并发抢答。
8. runtime snapshot 能追踪本轮使用的 prompt、soul、knowledge、skills、tools 和短期交通摘要。

长期记忆阶段再补充验收：

1. 每个专家可维护当前商家维度的 approved `memory.md`。
2. 咨询 runtime 实际注入 `memory.md`。
3. `memory.md` 被标注为背景，不被当作用户本轮输入。
4. runtime snapshot 能记录 `memory_match_ids`。

## 13. OpenClaw 参考文件

本规划主要参考了本地 OpenClaw 副本中的以下文件：

```text
references/open-source/openclaw/src/agents/system-prompt.ts
- CONTEXT_FILE_ORDER 定义 AGENTS/SOUL/MEMORY 等 Project Context 排序。
- buildProjectContextSection 在存在 SOUL.md 时增加人格遵循提示。
- stable Project Context 放在 prompt cache boundary 前，动态 channel/session guidance 放在后面。

references/open-source/openclaw/docs/concepts/system-prompt.md
- 说明 bootstrap files 会注入 Project Context。
- 说明 memory/*.md 默认不作为普通 Project Context，而是通过 memory_search / memory_get 按需读取。
- 说明 MEMORY.md 要保持简短。

references/open-source/openclaw/extensions/memory-core/src/flush-plan.ts
- pre-compaction memory flush 的默认目标是 memory/YYYY-MM-DD.md。
- 明确要求 MEMORY.md、DREAMS.md、SOUL.md、TOOLS.md、AGENTS.md 在 flush 中只读。

references/open-source/openclaw/extensions/memory-core/src/short-term-promotion.ts
- 记录 short-term recall store。
- applyShortTermPromotions() 会追加 Promoted From Short-Term Memory 区块到 MEMORY.md。

references/open-source/openclaw/extensions/memory-core/src/dreaming.ts
- dreaming sweep 运行 light -> REM -> deep。
- deep 阶段 rank candidates 后调用 applyShortTermPromotions() 晋升到 MEMORY.md。

references/open-source/openclaw/docs/concepts/dreaming.md
- 说明 dreaming 默认关闭。
- 说明 light/REM 不写 MEMORY.md，deep 写 MEMORY.md。
```

## 14. 参考项目清单

下一个窗口可以直接按本节理解“参考什么、不参考什么”。

### 14.1 OpenClaw

本地路径：

```text
references/open-source/openclaw/
```

主要参考：

- `AGENTS.md / SOUL.md / MEMORY.md` 的 Project Context 拼装方式。
- `CONTEXT_FILE_ORDER` 中 `AGENTS -> SOUL -> MEMORY` 的优先顺序。
- `SOUL.md` 作为人格/语气层，而不是工具权限或安全策略层。
- `MEMORY.md` 作为长期精选记忆，不是每轮对话自动覆盖。
- pre-compaction memory flush 先写 `memory/YYYY-MM-DD.md`，不直接写 `MEMORY.md`。
- dreaming deep phase 通过打分、recall count、unique queries、source rehydrate 后再晋升到 `MEMORY.md`。

不直接照搬：

- 不照搬文件系统 workspace 作为生产存储。
- 不照搬 cron/dreaming 作为第一阶段能力。
- 不照搬 memory tools 作为商家端可见工具。
- 不做 sub-agent 自动切换或多专家自由通信。

### 14.2 Mahilo

本地路径：

```text
references/open-source/圆桌访谈/wjayesh__mahilo/
```

主要参考：

- 一个 manager 统一管理多个 agent。
- 每个 agent 有自己的 personality、tools、session 边界。
- agent 之间的通信要有可控入口，而不是随意互聊。
- `can_contact` 这类约束说明：多 agent 自由通信必须有边界。

对本项目的取舍：

- 借鉴“共享 runtime + 专家容器 + 可控通信边界”。
- 不照搬 WebSocket/CLI 运行方式。
- 不做后台专家互相自由聊天。
- 第一阶段只做 `shared consultation state + expert turn note`，让专家之间通过 runtime 交通层交接。

### 14.3 mem0

本地路径：

```text
references/open-source/圆桌访谈/mem0ai__mem0/
```

主要参考：

- conversation memory、session memory、user memory、organizational memory 的分层。
- `run_id` 更适合短期/会话记忆，`user_id`/主体 ID 更适合长期记忆。
- 长期记忆不应该保存原始 transcript，而应该保存高信号事实、偏好、模式。
- 记忆可被检索，因此要谨慎处理隐私、错误事实和过期事实。

对本项目的取舍：

- V1 只做 session 级短期交通，不做长期自动写入。
- 后续长期记忆按 `agent_id + merchant_id` 作用域设计。
- 长期记忆必须可审阅、可删除、可追溯来源。

### 14.4 gao-agent

本地路径：

```text
references/open-source/gao-agent-main/wayne/
```

主要参考：

- AgentSpec compile/publish 思路：配置先编译成可追溯 runtime bundle，再运行。
- `instruction_asset / memory_config / knowledge_config / tool_bundle / skill_bundle` 的资产拆分方式。
- memory config 中 system/history/working/long-term memory budget 的分层。
- RuntimeProfileResolver / AgentAssetLoader / AgentExecutionFactory 这类分层。

对本项目的取舍：

- 借鉴“专家资产版本化 + runtime 快照可追溯”。
- 不在第一阶段引入完整 AgentSpec 编译系统。
- 先把现有 `agent_prompt_versions`、`agent_runtime_snapshots` 和 consultation-runtime 模块用好。

## 15. 下一个窗口开工说明

下一个窗口如果要直接开始实现，建议按这个顺序读：

```text
1. AGENTS.md
2. docs/README.md
3. docs/架构规范/2026-05-05-consultation-agent-assets-context-design.md
4. docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md
5. docs/handoff/2026-05-04-v2.2-agent-console-assets-handoff.md
6. docs/progress/2026-05-04-v2.2-agent-console-assets-implementation.md
```

第一阶段开工目标：

```text
实现 V1：短期专家交通和共享上下文
```

第一阶段不要做：

- 不做长期记忆自动晋升。
- 不做 memory candidates 自动审批。
- 不做专家自动切换建议。
- 不做专家后台自由聊天。
- 不做新圆桌 UI。

第一阶段建议改造方向：

1. 在 consultation runtime 内定义 `SharedConsultationState` 和 `ExpertTurnNote` 类型。
2. 每轮专家回复后，生成一条短期 `expert_turn_note`。
3. 下一轮用户 `@` 其他专家时，注入最近若干条 expert turn notes。
4. 将 shared state 和 expert notes 写入 runtime snapshot 的 metadata/tool summary 或新增轻量持久化字段；如果字段不足，再设计 migration。
5. 测试覆盖：
   - 专家 A 回复后生成 handoff note。
   - 专家 B 被 `@` 时能看到 A 的关键结论。
   - 切专家不清空 sessionContext。
   - 不出现专家后台自由互聊。

相关代码入口：

```text
app/src/server/api/consultation-runtime/types.ts
app/src/server/api/consultation-runtime/context.ts
app/src/server/api/consultation-runtime/runtime.ts
app/src/server/api/consultation-runtime/experts.ts
app/src/server/api/consultation-service.ts
app/src/server/api/consultation-service.test.ts
app/src/lib/db/agent-console-repository.ts
app/src/contracts/agent-console.ts
```

如果第一阶段顺手做后台 UI，只做 `System Prompt` 呈现为 `agent.md` 和预留 `soul.md` 入口；`memory.md` 不作为第一阶段阻塞项。

## 16. 结论

建议采用 OpenClaw 的核心思想，但不要照搬文件系统实现。

我们的产品态应该是：

```text
专家资产以 Markdown 形态编辑
底层以数据库版本和记录管理
runtime 编译成 Project Context
短期先做 shared state + expert turn notes
长期 memory 先人工 approved，后续再做候选晋升
```

最终目标不是制造“多个后端 Agent 在聊天”，而是让用户在同一个咨询空间里感受到：每个被 `@` 的专家都有独立职责、稳定气质和越来越懂这个商家的长期经验。
