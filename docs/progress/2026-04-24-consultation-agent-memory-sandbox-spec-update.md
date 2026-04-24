# 2026-04-24 咨询 Agent 记忆 / 插话 / 沙箱规范补充

## 背景

在咨询 Agent Runtime / Prompt / RAG 说明文档完成后，用户补充了几个关键方向：

- Claude Code 参考应继续看客户端源码。
- 咨询 Agent 上下文调度不应只写当前实现，还要覆盖长期记忆、短期会话记忆、工具调用、system prompt、商家资料、RAG 等完整顺序。
- 后续需要心跳机制，允许模型运行中插入用户新对话，至少区分引导模式和等待模式。
- 心跳不急，但长期记忆是下一步需要补的能力。
- Runtime 应有沙箱/权限边界，需要参考 Claude Code 和 Hermes Agent。

## 本轮执行

已更新：

```text
docs/架构规范/2026-04-24-consultation-agent-runtime-rag-spec.md
```

新增/补充内容：

- 明确当前实现与目标 Agent Runtime 的差距。
- 增加短期记忆、长期记忆、RAG 知识三层上下文模型。
- 增加目标版上下文注入顺序。
- 增加长期记忆读写生命周期：pre-turn recall、in-turn working memory、post-turn memory write。
- 增加建议新增的数据结构：`merchant_memories`、`merchant_memory_embeddings`、`consultation_session_summaries`、`agent_runs`、`agent_run_events`、`agent_pending_inputs`。
- 增加运行中插话/心跳设计：Guide 模式、Wait 模式、heartbeat、run events。
- 增加 Runtime Sandbox 设计：LLM Runtime Sandbox、Business Tool Sandbox、Storage / Network Sandbox、Execution Sandbox。
- 补充 Hermes Agent 参考点：`MemoryManager`、`ContextEngine`、`interrupt()` / `steer()`、gateway pending input、Docker sandbox、path security。
- 记录 Claude Code 本地参考路径当前在本机文件系统视图里仍只有目录结构和 `.DS_Store`，未看到可读源码文件；如果用户确认有另一路径或 iCloud 后续补齐，需要追加 code reading 文档。

## 关键结论

长期记忆应优先于心跳机制落地。

推荐下一步实现顺序：

1. `merchant_memories` / `merchant_memory_embeddings` schema。
2. `memory_search` / `memory_write_candidate` 受控业务工具。
3. 修改咨询 Agent context assembly，让长期记忆在 RAG 之前以 fenced context 注入。
4. 增加 session summary，避免长会话只靠 raw messages 和 strategy snapshot。
5. 再做 `agent_runs` / heartbeat / pending input。
6. 最后把 runtime sandbox policy 抽成独立模块，为发布、外部消息、自动导入等高风险工具做 approval gate。

## 验证

- 文档为 docs-only 更新，未运行构建。
- 已用 `rg` 检查文档中包含长期记忆、heartbeat、sandbox、agent runs 等关键字。
