# 2026-05-01 咨询 Agent 策略资产 Editor 零上下文交接

这份文档给“完全没有本聊天上下文”的下一位 AI / 开发者使用。目标是让 TA 看完后能继续和 W 一起推进，不要把刚收口的策略资产工具链路又改回硬编码解析。

## 当前分支与状态

- 工作区：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- 当前分支：`codex/integrate-main-gitee-meng-4.30`
- 当前任务状态：策略资产 Editor 链路已修复、已本地验证、已部署 staging、已 API E2E 验证。
- 本轮没有 Supabase migration。
- 本轮没有提交 commit，也没有合并分支。

当前相关改动文件：

- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/progress/2026-05-01-consultation-agent-skill-runtime.md`
- `docs/handoff/2026-05-01-consultation-agent-skill-runtime-handoff.md`

## 用户关心的核心问题

W 明确反对“runtime 用硬规则替 Agent 理解用户语义”。

之前出现过这种错误方向：

- 按中文破折号切说明。
- 对年龄范围里的普通横杠做特殊处理。
- 按去掉括号后的主标签去重。
- 从上一轮 assistant 文本里用规则抽取“这5个目标客群”。
- 用硬编码过滤 `门店 3 公里内高意向到店人群 / 门店周边上班族 / 新客体验人群`。

这些都不要再加回来。它们看起来能修某个 case，但本质是在 runtime 里做语义识别，会让工具调用退化成“服务端猜用户意图”。

## 当前正确设计

右侧 UI 看起来是一个 `策略资产 Editor`，底层仍然是结构化 `strategySnapshot`：

- `positioning`
- `coreSellingPoints`
- `targetAudiences`
- `keyScenes`
- `currentSuggestion`

咨询 Agent 编辑策略资产时，必须走 `update_strategy_asset_editor` function tool。

工具参数现在是完整文档，而不是局部 patch：

```json
{
  "changedFields": ["targetAudiences"],
  "strategyAsset": {
    "positioning": "...",
    "coreSellingPoints": ["..."],
    "targetAudiences": ["..."],
    "keyScenes": ["..."],
    "currentSuggestion": "..."
  },
  "changeSummary": "..."
}
```

`changedFields` 只表示“本轮哪些字段发生变化”，不再驱动 runtime 从用户原话里抽字段。

## runtime 允许做什么

runtime 只允许做数据卫生和工具可靠性保障：

- Zod schema 校验。
- 必填字段非空校验。
- 字符串 trim / 空白归一化。
- 数组去空。
- 精确字符串去重。
- 最大条数限制。
- tool arguments 校验失败时，作为 `role: "tool"` 的结果回灌给模型，并强制重试一次。

runtime 不允许做：

- 中文语义解析。
- 按标点切用户意图。
- 根据“这5个/刚才说的/这些”去上一轮回答里抽条目。
- 按括号主标签去重。
- 针对某些目标客群写特殊过滤名单。
- 没有 tool call 时自己生成新的业务字段。

如果模型没有 tool call、tool args 校验失败且重试失败、无 API key 或模型服务不可用，fallback 只返回当前 `strategySnapshot`，不猜用户想改什么。

## 代码位置

重点看 `app/src/server/api/consultation-service.ts`：

- `strategyAssetDocumentSchema`
- `strategyAssetEditorToolArgsSchema`
- `resolveStrategyAssetEditorPatch`
- `buildStrategyAssetEditorMessages`
- `strategyAssetEditorTool`
- `parseStrategyAssetEditorToolArgs`
- `normalizeStrategyAssetEditorToolArgs`
- `buildStrategyAssetSnapshotPatch`

测试看 `app/src/server/api/consultation-service.test.ts`：

- 已有反向断言，禁止重新引入：
  - `buildStrategyAssetEditorPatch`
  - `extractStrategyAssetFieldValue`
  - `extractReferencedTargetAudiences`
  - `shouldResolveReferencedTargetAudiences`
  - `completeStrategyAssetEditorPatch`
  - `isAllowedStrategyAssetListItem`
  - `splitTargetAudience`
  - `splitOnDunhao`

如果后续真的要新增更复杂的编辑能力，应优先增强 tool schema / prompt / retry 反馈，而不是给 runtime 加中文解析规则。

## 已验证结果

本地验证已通过：

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

staging 已部署：

- Deployment URL：`https://jingjing-content-platform-staging-hyppy49e8.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`

线上 API E2E 已通过：

- 验证会话：`344ae149-5ca2-422a-b7ea-e4b7e9b1d5dc`
- 第一轮让 Agent 提出 5 个目标客群，写入：
  - `都市年轻白领`
  - `创意设计师及自由职业者`
  - `三口之家或小家庭`
  - `首次购房者`
  - `投资型购房者`
- 第二轮用户说“你刚才说的这5个目标客群都要加进去，放到我的策略资产里的目标客群”。
- 返回仍为上述 5 个群体。
- 未检测到 `门店 3 公里 / 门店周边上班族 / 新客体验人群`。
- 未检测到 Markdown 标记。
- 工具卡：`update_strategy_snapshot / 编辑策略资产 / completed`。

## 部署与账号注意

- 本文档不记录登录密码。
- staging 登录和 API E2E 的具体账号密码只存在于聊天上下文，不应写入仓库文档。
- 如果下一窗口需要继续线上测试，向 W 确认或使用已有安全凭据来源。

## 后续建议

1. 如果 W 继续反馈“Agent 没按要求改”，先看工具调用参数和 `strategySnapshot`，不要先加 regex。
2. 如果是模型理解不稳定，优先改 `buildStrategyAssetEditorMessages` 或 tool schema 描述。
3. 如果是工具参数格式错，优先增强 Zod 错误回灌和重试提示。
4. 如果是 UI 展示不对，再看 `app/src/components/merchant/consultation-workspace.tsx`。
5. 如果要接着推进后台 Agent/Skill 配置，请继续沿用“渐进式披露 + 真实工具调用 + runtime 校验”的边界。

## 下一窗口开场建议

下一位 AI 进入后，先读：

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/handoff/2026-05-01-consultation-agent-strategy-editor-zero-memory-handoff.md`
4. `docs/progress/2026-05-01-consultation-agent-skill-runtime.md`
5. `app/src/server/api/consultation-service.ts`
6. `app/src/server/api/consultation-service.test.ts`

然后执行：

```bash
cd app
node --test src/server/api/consultation-service.test.ts
```

确认测试仍然防止硬编码解析回潮后，再继续新的产品/代码任务。
