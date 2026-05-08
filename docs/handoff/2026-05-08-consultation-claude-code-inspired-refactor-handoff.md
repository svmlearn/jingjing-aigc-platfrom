# 2026-05-08 咨询 Agent Claude Code 思想借鉴改造交接

## 给零记忆 Codex 的接手提示词

请直接复制以下整段给新的 Codex：

```text
你正在接手项目：/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台

先读根目录 AGENTS.md，再读 docs/README.md。当前用户希望继续深度改造「AI 咨询诊断」部分，目标是借鉴本地 Claude Code 泄漏源码里的 agentic runtime 思想，让咨询 Agent 更像一个稳定的工具驱动系统，而不是靠提示词和代码硬塞默认话术。

当前分支：main
最近关键代码提交：
- 6597399 fix: require knowledge retrieval for consultation reads
- 已推 GitHub origin/main 和 Gitee gitee/main
- 已部署 Vercel production，状态 Ready：https://jingjing-content-platform-staging.vercel.app

最新已完成修复：
1. 已确认 young 账号（邮箱 ywangyangw1@163.com）不是数据污染：
   - 用户 id：d1135528-8f9e-4106-8783-8dedc23c2057
   - 用户信息 id：e9a7fd77-a305-4b1e-adf7-446a0f93aa4d
   - 用户知识库有两个 indexed 文档：
     - 我的职业.txt，1 个 chunk
     - 解构自己.md，9 个 chunks
2. 之前咨询 Agent 说“无法直接查看你的知识库文件”的根因不是知识库缺失，而是 native tool loop 那轮 toolCount=0，没有真实调用 retrieve_knowledge_base。
3. 已修复：
   - app/src/server/api/consultation-runtime/utils.ts 增加 isExplicitKnowledgeBaseReadRequest
   - app/src/server/api/consultation-runtime/runtime.ts 在 native loop 开始前对明确“读知识库/上传文件”的请求先执行真实 retrieve_knowledge_base
   - app/src/server/api/consultation-runtime/rag.ts 对明确读取用户知识库的 query 直接读取该用户 indexed 文档 chunks，避免短 query 被平台方法论或向量检索漏掉
   - app/src/server/api/consultation-service.ts 移除“你可以不调用工具，直接给用户中文自然语言回复”的过宽提示；增加“必须先调用 retrieve_knowledge_base”的工具契约；buildToolCards 只渲染真实 toolResults，不再展示未执行工具的虚拟卡片
   - app/src/server/api/consultation-service.test.ts 增加覆盖
4. 验证已过：
   - cd app && node --test src/server/api/consultation-service.test.ts：34 passed
   - cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime：通过
   - cd app && npm run typecheck：通过
   - cd app && npm run build：通过
   - Vercel production deploy Ready
5. 详细留痕看：
   - docs/progress/2026-05-08-consultation-knowledge-tool-contract.md

用户现在的新要求：
“再去看看其他地方，我们需要非常好的借鉴 Claude Code 的思想，来改造我们的咨询部分。”

请不要急着大改。先做一次咨询 runtime 的架构审计，输出一个可执行的改造方案，必要时再实现第一批高价值改动。核心方向不是把 Claude Code 代码搬过来，而是吸收它的工程思想。

本地 Claude Code 参考源码位置：
references/open-source/claude-code泄漏的客户端源码/claude-code-main

已经看过且很重要的 Claude Code 文件/思想：
1. src/query.ts
   - 关键点：不要信 stop_reason === "tool_use"，它注释里明确说这个不可靠；应该扫描 assistant message 中真实 tool_use blocks。
   - tool_use block 出现后设置 needsFollowUp=true，执行工具，然后把 tool_result 作为下一轮消息继续递归/循环。
   - 流式 fallback 时会 tombstone orphaned assistant messages，并丢弃旧 executor，避免旧 tool_use_id 对应的孤儿 tool_result 混入新响应。
   - 上下文过长不是直接失败，而是有 microcompact、autocompact、reactive compact 等恢复路径。
2. src/QueryEngine.ts
   - 会记录 permission_denials、usage、stop_reason、error_during_execution 诊断信息。
   - 判断最终结果是否成功，不只是看有没有文本，而是看最后消息形态和 stop_reason/tool_result 是否合理。
   - 有 compact_boundary，能明确告诉后续消息“上下文已经压缩过”。
3. src/remote/sdkMessageAdapter.ts
   - tool_result 的识别靠 content shape，而不是不可靠字段。
   - 成功 result message 在多轮会话里可忽略，错误 result 才展示给用户；UI 不应把内部流水全部当正文噪音。
4. src/services/tools/toolExecution.ts
   - 工具找不到、输入非法、执行失败，也要变成结构化 tool_result，而不是让模型自己编一句话糊过去。
5. src/constants/prompts.ts 与各 tools/*/prompt.ts
   - 工具能力被明确写入 prompt，例如 Read/Grep/Glob 是可用能力。
   - 工具 prompt 不是业务话术，而是使用时机、输入约束、失败行为。
6. src/tools/TaskUpdateTool/prompt.ts
   - 完成状态有硬规则：测试失败/部分实现/遇到 unresolved errors 时不能标 completed。
   - 这可以借鉴到咨询 Agent 的阶段状态：只有真实工具完成且资产写入成功，才显示“已完成”。
7. src/tools/AskUserQuestionTool/prompt.ts
   - 问用户是工具化的，不是随便在正文里问一堆。
   - 可借鉴到咨询台：当资料不足时，Agent 应该产生一个“需要用户补充”的结构化结果，而不是硬编方向。

我们咨询部分现在重点文件：
- app/src/server/api/consultation-service.ts
- app/src/server/api/consultation-service.test.ts
- app/src/server/api/consultation-runtime/runtime.ts
- app/src/server/api/consultation-runtime/tools.ts
- app/src/server/api/consultation-runtime/rag.ts
- app/src/server/api/consultation-runtime/context.ts
- app/src/server/api/consultation-runtime/types.ts
- app/src/server/api/consultation-runtime/events.ts
- app/src/components/merchant/consultation-workspace.tsx
- app/src/contracts/consultation.ts
- app/src/lib/db/consultation-repository.ts
- app/src/lib/db/knowledge-repository.ts

建议你下一步做的架构审计：
1. 搜索所有仍可能导致“模型跳过工具但 UI/状态显示像执行过”的地方：
   - rg "skipped|fallback|toolResults|toolCount|执行|已读取|无法直接|不能直接|可以不调用工具|retrieve_knowledge_base|update_strategy_snapshot" app/src/server app/src/components app/src/contracts
2. 审计 native tool loop 是否满足：
   - tool_call 与 tool_result 一一对应
   - tool 执行失败也返回结构化 result
   - 对需要工具的意图有 deterministic contract，不靠模型自觉
   - 最终 reply 必须基于真实 toolResults/knowledgeMatches/strategySnapshot
3. 审计 UI 执行过程：
   - 只展示真实 toolResults
   - “思考中/执行中/完成/失败”来自事件事实，不来自硬编码文案
   - 不要展示未执行工具的虚拟 skipped 卡
4. 审计上下文管理：
   - session summary、recent messages、knowledgeMatches、strategySnapshot 的预算与优先级
   - 是否需要类似 compact_boundary 的“压缩/摘要边界事件”
   - 是否保留“这轮用了哪些资料、哪些工具、哪些资产版本”的可回放快照
5. 审计 prompt 与工具描述：
   - Agent.md / soul.md / buildNativeToolCallingMessages / buildAssistantReplyWithModel 分工是否清晰
   - Prompt 负责价值观和行为策略，runtime 负责硬契约，工具 prompt 负责使用时机和输入约束
   - 禁止把行业、场景、客群、卖点、到店咨询、私信转化等默认业务内容塞进通用代码
6. 审计测试：
   - 增加“明确读取知识库必须产生 retrieve_knowledge_base 工具事件”的行为测试或源码断言
   - 增加“资料不足时不得写策略资产，不得造行业”的测试
   - 增加“工具失败时 UI 展示错误结果，不展示业务默认结论”的测试

用户偏好和产品原则：
- 用户非常反感代码里写死业务兜底话术，比如“到店咨询、本地生活服务、私信转化、账号人设种草”等通用硬塞内容。
- 资料不足就让 Agent 承认资料不足并问关键问题，不要硬补业务结论。
- 不要把“商家资料/商家上下文/商家设置”继续作为前台文案；这套产品正在转为“用户信息/用户知识库”。
- 代码可以有错误兜底，例如 API 报错时说“抱歉，系统出现问题”；但不能有业务内容兜底。
- 右侧执行过程必须是真实执行事实，不是为了好看而展示“已执行 N 项”。

请先用代码审计方式给出：
1. 目前咨询 Agent runtime 距离 Claude Code 风格还差哪些关键能力。
2. 哪些能力必须放 runtime，哪些放 prompt/soul，哪些放 UI。
3. 一个分阶段改造计划，第一阶段最好能在 1 次提交内完成，且有测试。
4. 如果发现明显低风险问题，可以直接改 main，但改前先说明范围；改后跑：
   - cd app && node --test src/server/api/consultation-service.test.ts
   - cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime
   - cd app && npm run typecheck
   - 必要时 cd app && npm run build

交付要求：
- 如果只做方案，写到 docs/探索/ 或 docs/架构规范/，并在最终回答给出高信号摘要。
- 如果改代码，补 docs/progress/ 留痕。
- 不要引入新的业务默认样例。
- 不要回退 6597399 的修复。
- 不要引用外网，优先使用本地 Claude Code 参考源码。
```

## 本交接文件状态

本文件只用于切换上下文。它没有要求下一位直接实现全部内容，而是要求先做架构审计和分阶段方案，避免在咨询 runtime 里继续堆硬编码行为。
