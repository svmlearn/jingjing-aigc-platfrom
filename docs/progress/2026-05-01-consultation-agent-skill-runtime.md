# 2026-05-01 咨询 Agent Skill 运行链路修复记录

## 背景

本轮目标是确认并修复“平台后台给咨询 Agent 配 Skill”这条链路，同时判断它是否符合 Claude Code Skill 的渐进式披露思路，并把咨询台右侧策略资产明确收敛为受控业务工具写入。

参考源码资料：

- `references/open-source/claude-code泄漏的客户端源码/claude-code-main/docs/extensibility/skills.mdx`
- `references/open-source/claude-code泄漏的客户端源码/claude-code-main/docs/tools/what-are-tools.mdx`

核心判断：

- Skill 不是 Tool。Skill 是 Prompt/方法论/流程封装；Tool 是原子执行能力。
- 渐进式披露不是把所有 Skill Body 直接塞进 System Prompt，而是先暴露候选 Skill 的名称、描述、触发条件，命中后再注入本轮需要的 Skill Body。
- 咨询右侧的定位、卖点、客群、内容日历等资产不应被当成“Skill 写入”，而应由受控业务工具写入 `strategySnapshot`。

## 本轮改动

### 1. 后台 Agent 配置页 Skill 挂载从只读变为可保存

文件：

- `app/src/components/platform-admin/agent-console-pages.tsx`

变更：

- `挂载技能` 列表改为可勾选。
- 增加 `保存挂载` 按钮，调用现有 API：
  - `PATCH /api/platform-admin/agents/:agentId/skills`
- 本地保存状态、错误状态、成功提示已接入。
- 保存时只提交 `status === enabled` 的 Skill，避免 draft/disabled Skill 被挂入运行时。

结论：

- 之前链路“后端 API 有，但前端不可用”；现在后台 UI 到 API 的保存链路已接通。

### 2. 咨询 Agent runtime 接入线上 Agent 容器与 Skill 绑定

文件：

- `app/src/server/api/consultation-service.ts`

变更：

- 新增 `resolveConsultationAgentRuntime()`。
- 运行时优先读取：
  - `agent_route_bindings` 中 `consultation_default` 的 active Agent
  - 该 Agent 的 active Prompt Version
  - 该 Agent 的 enabled Skill Bindings
  - enabled Skill 资产
- 若 Agent 未启用、route 未绑定、Supabase/仓储报错，则回退到旧 `platform_settings.consultationAgent`。
- `sendConsultationMessageForUser()` 和 `createConsultationSessionForUser()` 均改为使用 runtime resolver。

结论：

- 之前商家端咨询仍主要吃旧平台设置；现在能读取后台 Agent 容器的 prompt + skills。

### 3. 渐进式披露接入咨询回复生成

文件：

- `app/src/server/api/consultation-service.ts`

变更：

- 候选 Skill 只注入简短列表：
  - name
  - skillKey
  - description
  - whenToUse
- 本轮命中后才注入 Skill Body，最多 3 个。
- Skill Body 单条裁剪到 3600 字符，避免无限膨胀 prompt。
- 事件与 visible summary 中记录：
  - `agentContainer`
  - `skillDisclosure.mode = progressive_disclosure`
  - candidate skill ids
  - active skill ids
- 中文咨询场景增加概念触发词：
  - 个人 IP、定位、亮点、优势、人设、产品、卖点、客群、场景、异议、内容、日历、图文、视频、脚本、转化、私信、到店

结论：

- 当前实现符合“候选摘要先曝光，正文按命中注入”的渐进式披露方向。
- 但它仍是轻量关键词匹配，不是 Claude Code 那种完整 SkillTool/fork 执行器。

### 4. 右侧策略资产明确为受控业务工具

文件：

- `app/src/server/api/consultation-service.ts`
- `app/src/components/merchant/consultation-workspace.tsx`

变更：

- 新增咨询业务工具目录：
  - `read_merchant_profile`
  - `retrieve_knowledge_base`
  - `read_history`
  - `update_strategy_snapshot`
  - `update_content_calendar`
  - `generate_article_brief`
  - `generate_video_brief`
- System Prompt 中加入“咨询 Agent 受控业务工具”说明。
- 右侧 UI 文案调整为：
  - 后台挂载 Skills 提供咨询方法论
  - 右侧定位、卖点、客群与内容日历由受控业务工具写入

结论：

- 右侧资产当前已经通过 `strategySnapshot` 更新；本轮把它在 runtime prompt、事件和 UI 语义上明确成工具写入。

## 验证

已执行：

```bash
cd app && npm run typecheck
```

结果：

- 通过。

已执行：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

结果：

- 3 个用例通过。
- Node 提示当前 `package.json` 未声明 `"type": "module"`，测试仍正常通过。这是已有测试运行方式的 warning，不影响本轮结论。

新增测试：

- `app/src/server/api/consultation-service.test.ts`

覆盖：

- runtime 是否读取线上 Agent prompt + skill bindings
- 是否存在 progressive disclosure prompt
- 右侧策略资产是否由 bounded business tools 表达

## 当前限制

- 后台 Skill 创建/编辑页面仍是只读；本轮只打通“挂载 Skill 到 Agent”。
- Knowledge Set 挂载仍是只读，本轮未改。
- 运行时未实现完整 Claude Code SkillTool：没有 inline/fork 执行、allowedTools 权限修改、usage ranking、paths 条件激活。
- Skill 命中逻辑是轻量关键词匹配，适合作为 V2.1 可用链路，不适合作为长期最终形态。
- 尚未做浏览器端手工点选验证，因为本轮主要做代码链路和类型/测试验证。

## 回滚方式

可按文件回退：

- `app/src/components/platform-admin/agent-console-pages.tsx`
- `app/src/server/api/consultation-service.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/server/api/consultation-service.test.ts`

不涉及数据库迁移。

## 16:12 staging 部署与验证补充

### Supabase

目标：

- Project：`jingjing-content-platform-staging`
- Project ref：`jrveaabguddromjtibbs`

执行：

```bash
cd app
supabase migration list
supabase db push --dry-run
```

结果：

- `202605010001` 已在 remote 生效。
- dry-run 返回：`Remote database is up to date.`
- 本轮没有新增 pending migration 被推送。

### Vercel

执行：

```bash
cd app
npm run typecheck
npm run build
node --test src/server/api/consultation-service.test.ts
vercel deploy --prod --yes
```

结果：

- Vercel deployment：`https://jingjing-content-platform-staging-i6bpd63w7.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- 远端 build 成功，生成页面 `48/48`。
- HTTP 检查：
  - `/`：200
  - `/login`：200
  - `/platform-admin-login`：200

### 浏览器验证说明

优先尝试 Codex 内置浏览器，但该浏览器对外部 staging URL 返回：

```text
Browser Use cannot determine if https://jingjing-content-platform-staging.vercel.app/platform-admin-login is allowed.
```

随后尝试 `web-access` 连接用户 Chrome。Chrome CDP proxy 旧进程无响应，重启 proxy 后仍等待 Chrome 授权并超时，因此本轮未完成 GUI 级点击验证。

### API / SSR 级验证

商家端：

- 使用商家账号登录 `/api/auth/merchant-login`，返回 `303 /dashboard`，cookie 写入成功。
- 调用 `/api/consultation/sessions` 返回 200，可读取已有咨询会话。
- 新建咨询会话成功，初始 tool cards 包含：
  - `read_merchant_profile`
  - `retrieve_knowledge_base`
  - `update_strategy_snapshot`
  - `update_content_calendar`
  - `generate_article_brief`
  - `generate_video_brief`
  - `read_history`
- 发送一条咨询消息后返回：
  - `agentContainer.agentKey = initial_consultation_agent`
  - `skillDisclosure.mode = progressive_disclosure`
  - 7 个工具均 `completed`
  - 右侧策略资产包含内容日历、图文 brief、视频 brief

后台端：

- 使用后台账号提交 `/platform-admin-login` Server Action，返回 `303 /platform-admin`，登录成功。
- 调用 `/api/platform-admin/agents` 返回 200：
  - online Agent：`initial_consultation_agent`
  - `serviceStatus = enabled`
- 调用 `/api/platform-admin/skills` 返回 200；验证前 staging skills 表为空。
- 调用 `PATCH /api/platform-admin/agents/:agentId/skills` 写入空数组返回 200，证明保存接口可用。

### 完整 Skill 渐进式披露 E2E

由于 staging 原本没有任何 Skill，临时创建了一个 staging 验证 Skill：

- `skillKey = staging_consultation_positioning_skill`
- 用途：验证个人 IP / 定位 / 亮点优势 / 产品卖点 / 目标客群触发

验证步骤：

1. 创建 enabled Skill。
2. 绑定到线上咨询 Agent。
3. 商家端新建咨询会话。
4. 发送包含“个人IP定位、亮点优势、产品卖点、目标客群”的消息。
5. 验证返回：
   - `candidateSkills` 包含该 Skill。
   - `activeSkills` 包含该 Skill。
   - `skillDisclosure.mode = progressive_disclosure`。
   - 7 个业务工具均 completed。
6. 清理：
   - 将线上咨询 Agent 的 Skill binding 恢复为空。
   - 将该 staging 验证 Skill 置为 `disabled`。

清理结果：

- `remainingEnabledBindings = 0`
- `validationSkillStatus = disabled`

结论：

- 部署后的后台配置保存链路、咨询 runtime 读取 Agent 容器、Skill 渐进式披露、右侧策略工具写入链路均已通过 staging 验证。
- GUI 浏览器点击验证受 Chrome 授权超时影响未完成，但 API/SSR 验证已经覆盖核心行为。

## 16:40 目标客群无法覆盖的修复

用户在 staging 发现：咨询 Agent 回复里会说“已把目标客群调整为 X”，但右侧策略资产的“目标客群”仍停留在默认值，说明自然语言回复和受控策略资产写入脱节。

当时修复：

- 将 `update_strategy_snapshot` 的语义升级为“策略资产 Editor”，把定位、卖点、客群、场景、建议作为一个整体文档编辑，而不是让右侧多张卡片各自看起来像独立工具。
- `tsconfig.json` 排除 `.next/types` 下带空格编号的本地重复生成文件，避免 `npm run typecheck` 被缓存副本误报重复声明。
- 新增明确字段覆盖识别（后续 19:10 已废弃，见下方“全量文档工具调用收口”）：
  - `目标客群 / 目标人群 / 客群 / 服务谁 / 受众 / 客户画像 / 用户画像`
  - `核心卖点 / 卖点 / 亮点 / 优势 / 产品卖点`
  - `核心场景 / 关键场景 / 场景 / 使用场景 / 成交场景`
  - `产品定位 / 品牌定位 / 定位 / 我们是谁`
  - `当前建议 / 建议 / 下一步建议 / 策略建议`
- 当用户说“把目标客群改成/调整为 X”时，Editor patch 会直接覆盖 `strategySnapshot.targetAudiences`，不再被默认“门店 3 公里内高意向到店人群”兜底值抢回。
- 商家端右侧从“产品定位 / 核心卖点卡 / 目标客群 / 当前建议”多卡片，收束为一个 `策略资产 Editor` 面板，内部展示同一份资产的不同字段。

验证：

```bash
cd app
node --test src/server/api/consultation-service.test.ts
npm run build
npm run typecheck
```

结果：

- 咨询服务测试 3/3 通过。
- Next production build 通过，远端页面数仍为 48/48。
- `npm run typecheck` 通过。

### staging 重新部署与目标客群覆盖验证

执行：

```bash
cd app
vercel deploy --prod --yes
```

结果：

- Deployment URL：`https://jingjing-content-platform-staging-66j0g22zc.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- 远端 build 成功，生成页面 `48/48`。

接口级 E2E：

- 商家登录成功，返回 `303 /dashboard`。
- 新建验证咨询会话成功。
- 发送消息：要求把目标客群调整为“光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）”。
- 返回的 `strategySnapshot.targetAudiences` 精确变为：
  - `光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）`
- `videoBrief.hook` 也同步使用了该目标客群。
- 最新 assistant message 的工具卡：
  - key：`update_strategy_snapshot`
  - label：`编辑策略资产`
  - status：`completed`
  - summary：明确显示“目标客群 -> 光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）”
- 最终 alias 指向新部署后，重新读取该验证会话仍返回相同 `targetAudiences` 和 `编辑策略资产` 工具卡。

结论：

- “AI 说改了但右侧目标客群没改”的问题已在 staging API 链路复现后修复并验证。
- 本轮没有数据库结构变化，不需要 Supabase migration。

## 18:15 策略资产 Editor 改为真实工具参数

用户继续验证发现：虽然字段能改了，但“改一下核心场景吧---我们不是门店，是房地产”会把“吧---我们不是门店，是”这类口语编辑指令一起写入资产。这说明上一版主要靠后端硬规则抽取字段，能保底但不够像 Agent 自己调用工具。

当时修复：

- `update_strategy_snapshot` 执行时先调用模型，让咨询 Agent 调用 `update_strategy_asset_editor` function tool。
- 工具参数由 Agent 结构化传入 `changedFields / positioning / coreSellingPoints / targetAudiences / keyScenes / currentSuggestion`。
- 系统提示明确要求只写入干净业务内容，不要把聊天口语、编辑动作、Markdown、引号或额外解释写入字段。
- 当时仍保留了硬规则 fallback；后续 19:10 已移除这条 fallback，见下方“全量文档工具调用收口”。

验证：

```bash
cd app
node --test src/server/api/consultation-service.test.ts
npm run typecheck
npm run build
vercel deploy --prod --yes
```

结果：

- 本地测试、typecheck、build 均通过。
- Vercel deployment：`https://jingjing-content-platform-staging-b1dx2n9d5.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- 远端 build 成功，页面 `48/48`。

staging E2E：

- 新建验证会话：`8382ee9e-0b03-442e-97d5-803f209fe2b0`
- 发送：`改一下核心场景吧---我们不是门店，是房地产`
- 返回：
  - `strategySnapshot.keyScenes = ["房地产首次看房前的信任建立"]`
  - `editorPatch.mode = strategy_asset_editor`
  - `editorPatch.changedFields = ["keyScenes"]`
  - 工具卡：`编辑策略资产` / `completed`

当时结论：

- 现在主链路已经不是纯硬规则匹配，而是 Agent 先调用结构化工具并传参，后端再落库。
- 但仍保留规则抽取兜底，这个设计后来被判定为错误方向并移除。

## 18:40 策略资产工具参数校验与重试补强

用户追问：如果本质是模型输出 tool arguments，那系统 prompt 是否只是在要求模型输出 JSON？如果模型不稳定怎么办？对照 Claude Code 源码后，本轮补上 runtime 侧校验与重试，不再只依赖提示词约束。

已修：

- 为 `update_strategy_asset_editor` 的 arguments 增加 Zod schema：
  - `changedFields` 必须是限定字段枚举数组。
  - `positioning/currentSuggestion` 必须是字符串。
  - `coreSellingPoints/targetAudiences/keyScenes` 必须是字符串数组。
  - `.strict()` 禁止多余字段。
- 模型首次 tool call 返回后，runtime 先 `safeParse`，再做业务清洗。
- 如果 arguments 不是合法 JSON、字段类型不对、`changedFields` 声明了字段但没有可保存干净值：
  - runtime 不落库。
  - 把校验错误作为 `role: "tool"` 的工具结果返回给模型。
  - 强制模型重新调用一次 `update_strategy_asset_editor`。
- 当时仍保留 `buildStrategyAssetEditorPatch` 作为兜底；后续 19:10 已移除，不再由 runtime 做语义解析。

验证：

```bash
cd app
node --test src/server/api/consultation-service.test.ts
npm run typecheck
npm run build
```

结果：

- `consultation-service.test.ts`：5 项通过。
- `tsc --noEmit`：通过。
- `next build`：通过，页面 `48/48`。
- staging 已重新部署：
  - Deployment URL：`https://jingjing-content-platform-staging-16lyrs3al.vercel.app`
  - Alias：`https://jingjing-content-platform-staging.vercel.app`

staging API E2E：

- 新建会话：`dab522cd-379b-46f8-9dec-faf34df6d76b`
- 用户消息：`改一下核心场景吧---我们不是门店，是房地产`
- 返回：
  - `strategySnapshot.keyScenes = ["房地产首次咨询前的信任建立"]`
  - 工具卡：`编辑策略资产` / `completed`
  - 工具 summary：`关键场景 -> 房地产首次咨询前的信任建立`
- 目标客群回归会话：`3342b992-61fe-49e7-9d4a-2bfb058e2a8d`
- 用户消息：把目标客群调整为“光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）”
- 返回：
  - `strategySnapshot.targetAudiences = ["光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）"]`
  - 工具 summary：`目标客群 -> 光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）`

结论：

- 现在不是让模型“随便输出 JSON 再硬解析”，而是 OpenAI-compatible tool call + runtime Zod 校验 + tool result 纠错重试。
- 这更接近 Claude Code 的链路：工具声明 schema，模型给 tool input，runtime 校验，失败时把错误回灌，而不是把坏参数直接执行。

## 19:10 全量文档工具调用收口，移除 runtime 语义解析

用户继续指出：“只按中文破折号切说明、不切年龄范围里的普通横杠、按去掉括号后的主标签去重”这类逻辑，本质又回到了 runtime 硬编码识别和切分。

本轮修正：

- 移除 `buildStrategyAssetEditorPatch`、`extractStrategyAssetFieldValue`、`parseStrategyAssetList`、`cleanupStrategyAssetValue`、`isAllowedStrategyAssetListItem` 等 runtime 语义解析/切分/过滤函数。
- `update_strategy_asset_editor` 改为全量文档工具：模型必须传入完整 `strategyAsset`，包含：
  - `positioning`
  - `coreSellingPoints`
  - `targetAudiences`
  - `keyScenes`
  - `currentSuggestion`
- `changedFields` 只用于标记本轮变化，不再决定 runtime 从用户原话里抽取哪个字段。
- runtime 只做：
  - Zod schema 校验
  - 必填字段非空校验
  - 字符串 trim / whitespace normalize
  - 数组去空、精确字符串去重、最大条数限制
  - 校验失败时把 tool result 回传给模型并重试一次
- 当模型没有 tool call、tool args 校验失败且重试失败、无 API key 或模型服务不可用时，fallback 只返回当前 `strategySnapshot`，不再猜用户想改什么。
- 测试新增反向断言，禁止重新引入：
  - `buildStrategyAssetEditorPatch`
  - `extractStrategyAssetFieldValue`
  - `extractReferencedTargetAudiences`
  - `shouldResolveReferencedTargetAudiences`
  - `completeStrategyAssetEditorPatch`
  - `isAllowedStrategyAssetListItem`
  - `splitTargetAudience`
  - `splitOnDunhao`

当前结论：

- UI 仍展示为一个策略资产 Editor；底层仍是结构化 `strategySnapshot`。
- “这5个/刚才提到的/这些”由模型基于 `recentConversation` 和 `currentStrategySnapshot` 在 tool arguments 里解决。
- runtime 不再按中文破折号、年龄范围、括号主标签等规则理解业务语义。

本地验证：

```bash
cd app
node --test src/server/api/consultation-service.test.ts
npm run typecheck
npm run build
```

结果：

- `consultation-service.test.ts`：6 项通过。
- `tsc --noEmit`：通过。
- `next build`：通过，页面 `48/48`。

staging 重新部署：

- Deployment URL：`https://jingjing-content-platform-staging-hyppy49e8.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- 远端 build 成功，页面 `48/48`。

staging API E2E：

- 新建验证会话：`344ae149-5ca2-422a-b7ea-e4b7e9b1d5dc`
- 第一轮用户消息：要求 Agent 先列出 5 个最值得写进策略资产的目标客群。
- 第一轮返回的 `strategySnapshot.targetAudiences`：
  - `都市年轻白领`
  - `创意设计师及自由职业者`
  - `三口之家或小家庭`
  - `首次购房者`
  - `投资型购房者`
- 第二轮用户消息：`你刚才说的这5个目标客群都要加进去，放到我的策略资产里的目标客群。不要加旧模板客群，也不要改成门店3公里这种默认说法。`
- 第二轮返回：
  - `targetAudiences` 仍为上述 5 个群体。
  - `count = 5`
  - 未检测到 `门店 3 公里 / 门店周边上班族 / 新客体验人群`。
  - 未检测到 Markdown 标记。
  - `update_strategy_snapshot` 工具卡：`编辑策略资产 / completed`
  - summary：`策略资产 Editor 已更新：目标客群 -> 都市年轻白领、创意设计师及自由职业者、三口之家或小家庭、首次购房者、投资型购房者。`

结论：

- 线上已验证“这5个”指代由模型结合 `recentConversation` 处理，并通过完整 `strategyAsset` 工具参数写入。
- runtime 不再靠破折号切分、括号主标签去重或目标客群特殊过滤实现这条链路。
