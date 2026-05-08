# 2026-05-08 咨询 Agent 用户知识库读取修复

## 背景

用户反馈：在 `young` 账号的咨询会话里，用户明确说“我的知识库里面传了我两个文件，你可以读一下”，咨询 Agent 仍回复“我现在还不能直接查看你的知识库文件”。这不符合产品预期：用户知识库已经上传并完成索引时，Agent 应该先读取受控上下文，再基于资料回答；资料不足才追问。

## 数据核查

- 用户邮箱：`ywangyangw1@163.com`
- 用户 id：`d1135528-8f9e-4106-8783-8dedc23c2057`
- 用户信息 id：`e9a7fd77-a305-4b1e-adf7-446a0f93aa4d`
- 用户名称：`young`
- 用户知识库文档：
  - `我的职业.txt`，状态 `indexed`，1 个 chunk
  - `解构自己.md`，状态 `indexed`，9 个 chunks

结论：不是数据缺失，也不是知识库未索引。问题出在咨询运行时没有稳定执行 `retrieve_knowledge_base`。

## 会话核查

目标会话中，用户提出“我的知识库里面传了我两个文件，你可以读一下”后：

- `agent.loop.completed` 记录 `toolCount: 0`
- 未出现真实 `agent.tool.requested`
- `visible_summary.agentLoop.toolResults` 为空
- 右侧执行卡此前会展示一些未执行工具的说明，容易让界面看起来像“检索过但没命中”

结论：Agent 不是读不到，而是本轮没有调用真实知识库工具；UI 执行卡也不能继续展示未执行工具的虚拟状态。

## Claude Code 对照

参考本地开源资料 `references/open-source/claude-code泄漏的客户端源码/claude-code-main`：

- `src/query.ts` 不依赖 `stop_reason === "tool_use"`，而是扫描 assistant message 里的真实 `tool_use` blocks。
- assistant message 里只要包含工具调用，就进入下一轮执行。
- 工具执行后一定生成 `tool_result` message，错误也作为工具结果返回。
- 文件读取类工具在 prompt 层被明确描述为可用能力，不让模型用正文声明“无法读取”来绕开工具链路。

产品结论：咨询 Agent 不应该靠硬写一段业务回答来处理这种场景，而应该把“需要读取知识库”变成运行时工具契约。

## 本次修复

### 1. 明确知识库读取意图

新增 `isExplicitKnowledgeBaseReadRequest`，识别“知识库 / 上传文件 / 这些文档 + 读取 / 查看 / 分析 / 总结”等明确请求。

### 2. 运行时先执行必要工具

在 native tool calling loop 开始前检查当前用户消息：

- 如果明确要求读取用户知识库或已上传文件；
- 且 `retrieve_knowledge_base` 已启用；
- 且本轮还没有真实工具结果；

则运行时先合成一条合法 assistant tool call，实际执行 `retrieve_knowledge_base`，再把真实 tool result 放回 message 列表，让模型基于工具结果回复。

该路径会记录：

- `agent.tool.requested`
- `source: "runtime_required_tool_contract"`
- planner trace
- completed tool event

### 3. 用户文档直读

当 query 是明确读取用户知识库时，`retrieveConsultationKnowledge` 会直接读取该用户 scope 下已 indexed 的文档 chunks，避免向量/关键词检索误把平台方法论作为主要结果，或因为 query 太短而漏掉用户上传文件。

### 4. 回复约束

Prompt 中移除旧的“你可以不调用工具，直接给用户中文自然语言回复”宽松表达，改为：

- 明确要求读取、查看、分析用户知识库或已上传文件时，必须先调用 `retrieve_knowledge_base`；
- `knowledgeMatches` 已包含用户知识库片段时，直接基于片段总结；
- 不要声称无法直接查看用户知识库或上传文件。

### 5. 执行卡只显示真实工具结果

`buildToolCards` 改为只渲染本轮真实 `toolResults`。不再为未执行的工具生成“本轮尚未写入策略资产”等虚拟卡片。

## 修改文件

- `app/src/server/api/consultation-runtime/utils.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/rag.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`

## 验证

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

结果：34 条通过。Node 仍有 package 未声明 ESM 的既有 warning，不影响测试。

```bash
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime
```

结果：通过。

```bash
cd app && npm run typecheck
```

结果：通过。

## 预期效果

用户再次输入“我的知识库里面传了两个文件，你可以读一下”时：

1. 运行时会先执行 `retrieve_knowledge_base`。
2. 工具会读取用户已 indexed 的知识库文档片段。
3. Agent 会基于 `我的职业`、`解构自己` 等用户资料总结或继续追问。
4. 不会再用正文说“我不能直接查看你的知识库文件”。
5. 右侧执行过程只展示真实发生过的工具调用。
