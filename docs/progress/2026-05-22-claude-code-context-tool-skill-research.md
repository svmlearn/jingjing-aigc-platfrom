# 2026-05-22 Claude Code 上下文 / 工具 / Skill 机制调研

状态：已完成调研文档，待验收 / 待后续实现

## 背景

用户要求对本地参考仓库 `references/open-source/claude-code项目/claude-code-main` 做一次细节调研，目标不是立即改造代码，而是产出足够准确的架构内容，让后续没有上下文记忆的 AI 也能按文档精准修改咨询 Agent。

本轮重点围绕：

- 多轮消息如何保存和进入模型。
- 商家资料 / 历史消息应不应该是 LLM 可见工具。
- Skill 列表、Skill 正文、Skill 激活在 Claude Code 中的边界。
- strict 工具参数校验和 runtime 内部展示过滤的边界。

## 调研产物

新增文档：

- `docs/架构规范/2026-05-22-Claude-Code上下文工具Skill机制调研与咨询Agent改造指引.md`

该文档包含：

- Claude Code 参考仓库的源码 / 文档证据索引，带具体文件与行号。
- 当前咨询 Agent 与 Claude Code 架构的差异。
- 目标架构：LLM 可见工具清单、自动上下文分层、消息数组结构、Skill 激活方向。
- 文件级改造清单，覆盖 contracts、schemas、platform settings、runtime tools、planner、context builder、service message builder、skills、tests。
- 验收标准和禁止做法。

## 关键结论

1. `read_merchant_profile` 和 `read_history` 不应继续作为 LLM 可见工具。它们对应的信息本来已经在 runtime state 中，应改为自动上下文。
2. 当前 `merchant/userMessage/round/expertRouting/strategySnapshot/currentKnowledgeMatches` 单个 user JSON 应拆成 runtime context message + 独立真实 user message。
3. `retrieve_knowledge_base`、`search_benchmark_materials`、`update_strategy_snapshot`、`update_content_calendar` 才是咨询主模型当前应看到的真实业务工具。
4. Skill 候选目录可以短说明进入 system prompt，但 Skill 正文不应由启发式每轮自动塞进 system prompt；后续应走显式激活工具或 attachment message。
5. 工具参数 strict 校验继续保留，不用 `.strip()` 掩盖模型多传字段；内部 rejected trace 和商家可见卡片分离即可。

## 本轮验证

本轮为文档调研任务，没有改运行时代码，未重新运行应用测试。

已执行：

- 读取 Claude Code 参考仓库源码和文档。
- 读取当前项目 consultation runtime、tools、planner、context、service、settings 相关源码。
- `wc -l` 与抽样 `sed` 自检调研文档结构。

## 分支状态

- Branch：`codex/agent-tool-schema-fix`
- Worktree：`../jingjing-agent-tool-schema-fix`
- Push：未 push
- Merge：未 merge
- Final commit：以交付时 `codex/agent-tool-schema-fix` 分支 HEAD 为准
